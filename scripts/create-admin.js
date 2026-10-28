require('dotenv').config();

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    const { MONGODB_URI, MONGODB_DB, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    const email = typeof ADMIN_EMAIL === 'string' ? ADMIN_EMAIL.trim().toLowerCase() : '';

    if (!MONGODB_URI || !email || !ADMIN_PASSWORD) {
        throw new Error('Configura MONGODB_URI, ADMIN_EMAIL y ADMIN_PASSWORD antes de crear el administrador.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('ADMIN_EMAIL no es un correo válido.');
    }

    if (ADMIN_PASSWORD.length < 6 || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
        throw new Error('ADMIN_PASSWORD debe tener al menos 6 caracteres y no superar 72 bytes.');
    }

    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const users = client.db(MONGODB_DB || undefined).collection('users');
        await users.createIndex(
            { email: 1 },
            { unique: true, partialFilterExpression: { app: 'adl' } }
        );
        await users.updateOne(
            { email, app: 'adl' },
            {
                $set: {
                    app: 'adl',
                    email,
                    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
                    role: 'admin',
                    canAddProduct: true
                },
                $setOnInsert: {
                    nombre: 'Administrador',
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
        console.log(`Administrador configurado para ${email}.`);
    } finally {
        await client.close();
    }
}

createAdmin().catch(error => {
    console.error('No se pudo crear el administrador:', error.message);
    process.exitCode = 1;
});
