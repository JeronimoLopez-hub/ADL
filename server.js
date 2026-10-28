require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const { MONGODB_URI, JWT_SECRET } = process.env;
const GITHUB_PAGES_ORIGIN = process.env.GITHUB_PAGES_ORIGIN;
const PORT = Number(process.env.PORT) || 3000;

if (!MONGODB_URI) {
    throw new Error('Falta configurar MONGODB_URI en el archivo .env.');
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
}

if (!GITHUB_PAGES_ORIGIN) {
    throw new Error('Falta configurar GITHUB_PAGES_ORIGIN con el origen de GitHub Pages.');
}

const mongoClient = new MongoClient(MONGODB_URI);
const app = express();

if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

app.use(cors({
    origin: GITHUB_PAGES_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10kb' }));

function publicUser(user) {
    return {
        id: user._id.toString(),
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        canAddProduct: user.canAddProduct
    };
}

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireUser(users) {
    return async (req, res, next) => {
        const authorization = req.get('authorization') || '';
        const [scheme, token] = authorization.split(' ');
        if (scheme !== 'Bearer' || !token) {
            res.status(401).json({ error: 'Inicia sesión para continuar.' });
            return;
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (typeof decoded === 'string' || typeof decoded.sub !== 'string'
                || !ObjectId.isValid(decoded.sub)) {
                res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
                return;
            }

            const user = await users.findOne({ _id: new ObjectId(decoded.sub), app: 'adl' });
            if (!user) {
                res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
                return;
            }

            req.authUser = user;
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
                return;
            }
            next(error);
        }
    };
}

function requireAdmin(req, res, next) {
    if (req.authUser.role !== 'admin') {
        res.status(403).json({ error: 'Esta acción está reservada al administrador.' });
        return;
    }

    next();
}

async function start() {
    await mongoClient.connect();
    const database = mongoClient.db(process.env.MONGODB_DB || undefined);
    const users = database.collection('users');
    const indexes = await users.indexes();
    const hasUniqueEmailIndex = indexes.some(index =>
        index.unique === true
        && Object.keys(index.key).length === 1
        && index.key.email === 1
    );
    if (!hasUniqueEmailIndex) {
        await users.createIndex(
            { email: 1 },
            {
                name: 'adl_email_unique',
                unique: true,
                partialFilterExpression: { app: 'adl' }
            }
        );
    }

    app.post('/api/auth/register', async (req, res, next) => {
        try {
            const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
            const email = normalizeEmail(req.body?.email);
            const password = req.body?.password;

            if (!nombre || nombre.length > 100 || !validEmail(email)) {
                res.status(400).json({ error: 'Ingresa un nombre y un correo electrónico válidos.' });
                return;
            }

            if (typeof password !== 'string'
                || password.length < 6
                || Buffer.byteLength(password, 'utf8') > 72) {
                res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres y no superar 72 bytes.' });
                return;
            }

            const user = {
                app: 'adl',
                nombre,
                email,
                passwordHash: await bcrypt.hash(password, 12),
                role: 'user',
                canAddProduct: false,
                createdAt: new Date()
            };

            try {
                const result = await users.insertOne(user);
                user._id = result.insertedId;
            } catch (error) {
                if (error.code === 11000) {
                    res.status(409).json({ error: 'El correo ya está registrado. Inicia sesión.' });
                    return;
                }
                throw error;
            }

            const token = jwt.sign({}, JWT_SECRET, { subject: user._id.toString(), expiresIn: '7d' });
            res.status(201).json({ user: publicUser(user), token });
        } catch (error) {
            next(error);
        }
    });

    app.post('/api/auth/login', async (req, res, next) => {
        try {
            const email = normalizeEmail(req.body?.email);
            const password = req.body?.password;
            if (!validEmail(email) || typeof password !== 'string') {
                res.status(400).json({ error: 'Ingresa un correo y una contraseña válidos.' });
                return;
            }

            const user = await users.findOne({ email, app: 'adl' });
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
                return;
            }

            const token = jwt.sign({}, JWT_SECRET, { subject: user._id.toString(), expiresIn: '7d' });
            res.json({ user: publicUser(user), token });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/auth/me', requireUser(users), (req, res) => {
        res.json({ user: publicUser(req.authUser) });
    });

    app.post('/api/auth/logout', (req, res) => {
        res.json({ ok: true });
    });

    app.get('/api/users', requireUser(users), requireAdmin, async (req, res, next) => {
        try {
            const storedUsers = await users.find({ app: 'adl' }, {
                projection: { nombre: 1, email: 1, role: 1, canAddProduct: 1 }
            }).sort({ createdAt: 1 }).toArray();
            res.json({ users: storedUsers.map(publicUser) });
        } catch (error) {
            next(error);
        }
    });

    app.patch('/api/users/:id/permissions', requireUser(users), requireAdmin, async (req, res, next) => {
        try {
            if (!ObjectId.isValid(req.params.id) || typeof req.body?.canAddProduct !== 'boolean') {
                res.status(400).json({ error: 'Solicitud de permisos no válida.' });
                return;
            }

            const userId = new ObjectId(req.params.id);
            const targetUser = await users.findOne({ _id: userId, app: 'adl' });
            if (!targetUser) {
                res.status(404).json({ error: 'No se encontró el usuario.' });
                return;
            }

            if (targetUser.role === 'admin') {
                res.status(400).json({ error: 'No se pueden cambiar los permisos de un administrador.' });
                return;
            }

            await users.updateOne(
                { _id: userId },
                { $set: { canAddProduct: req.body.canAddProduct } }
            );
            targetUser.canAddProduct = req.body.canAddProduct;
            res.json({ user: publicUser(targetUser) });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/health', (req, res) => {
        res.json({ ok: true });
    });

    app.use('/api', (req, res) => {
        res.status(404).json({ error: 'No se encontró esta ruta de la API.' });
    });

    app.use((error, req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }

        if (error.type === 'entity.parse.failed') {
            res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
            return;
        }

        if (error.type === 'entity.too.large') {
            res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
            return;
        }

        console.error(error);
        res.status(500).json({ error: 'Ocurrió un error interno. Inténtalo nuevamente.' });
    });

    app.listen(PORT, () => {
        console.log(`ADL disponible en http://localhost:${PORT}`);
    });
}

start().catch(async error => {
    console.error('No se pudo iniciar el servidor de ADL:', error);
    await mongoClient.close();
    process.exitCode = 1;
});
