require('dotenv').config();

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const { MONGODB_URI, SESSION_SECRET } = process.env;
const PORT = Number(process.env.PORT) || 3000;

if (!MONGODB_URI) {
    throw new Error('Falta configurar MONGODB_URI en el archivo .env.');
}

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
}

const mongoClient = new MongoClient(MONGODB_URI);
const app = express();

if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

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

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => error ? reject(error) : resolve());
    });
}

function destroySession(req) {
    return new Promise((resolve, reject) => {
        req.session.destroy(error => error ? reject(error) : resolve());
    });
}

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireUser(users) {
    return async (req, res, next) => {
        if (!req.session.userId || !ObjectId.isValid(req.session.userId)) {
            res.status(401).json({ error: 'Inicia sesión para continuar.' });
            return;
        }

        try {
            const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
            if (!user) {
                await destroySession(req);
                res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
                return;
            }

            req.authUser = user;
            next();
        } catch (error) {
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
    await users.createIndex({ email: 1 }, { unique: true });

    app.use(session({
        name: 'adl.sid',
        secret: SESSION_SECRET,
        store: MongoStore.create({
            client: mongoClient,
            dbName: database.databaseName,
            collectionName: 'sessions'
        }),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    }));

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

            await regenerateSession(req);
            req.session.userId = user._id.toString();
            res.status(201).json({ user: publicUser(user) });
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

            const user = await users.findOne({ email });
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
                return;
            }

            await regenerateSession(req);
            req.session.userId = user._id.toString();
            res.json({ user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/auth/me', async (req, res, next) => {
        if (!req.session.userId || !ObjectId.isValid(req.session.userId)) {
            res.json({ user: null });
            return;
        }

        try {
            const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
            if (!user) {
                await destroySession(req);
                res.json({ user: null });
                return;
            }

            res.json({ user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    app.post('/api/auth/logout', async (req, res, next) => {
        try {
            await destroySession(req);
            res.clearCookie('adl.sid', {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production'
            });
            res.json({ ok: true });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/users', requireUser(users), requireAdmin, async (req, res, next) => {
        try {
            const storedUsers = await users.find({}, {
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
            const targetUser = await users.findOne({ _id: userId });
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

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    app.get('/logo-adl.jpg', (req, res) => {
        res.sendFile(path.join(__dirname, 'logo-adl.jpg'));
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
