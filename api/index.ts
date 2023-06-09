import { PrismaClient } from '@prisma/client';
import { withPresets } from '@zenstackhq/runtime';
import { ZenStackMiddleware } from '@zenstackhq/server/express';
import { compareSync } from 'bcryptjs';
import dotenv from 'dotenv';
import type { Request } from 'express';
import express from 'express';
import swaggerUI from 'swagger-ui-express';
import jwt from 'jsonwebtoken';
import RestApiHandler from '@zenstackhq/server/api/rest';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Vercel can't properly serve the Swagger UI CSS from its npm package, here we
// load it from a public location
const options = {
    customCssUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.css',
};
const spec = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../petstore-api.json'), 'utf8')
);
app.use('/api/docs', swaggerUI.serve, swaggerUI.setup(spec, options));

const prisma = new PrismaClient();

// load .env environment variables
dotenv.config();

/**
 * Login input
 * @typedef {object} LoginInput
 * @property {string} email.required - The email
 * @property {string} password.required - The password
 */

/**
 * Login response
 * @typedef {object} LoginResponse
 * @property {string} id.required - The user id
 * @property {string} email.required - The user email
 * @property {string} token.required - The access token
 */

/**
 * POST /api/login
 * @tags user
 * @param {LoginInput} request.body.required - input
 * @return {LoginResponse} 200 - login response
 */
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
        where: { email },
    });
    if (!user || !compareSync(password, user.password)) {
        res.status(401).json({ error: 'Invalid credentials' });
    } else {
        // sign a JWT token and return it in the response
        const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!);
        res.json({ id: user.id, email: user.email, token });
    }
});

function getUser(req: Request) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return undefined;
    }
    try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
        return { id: decoded.sub };
    } catch {
        // bad token
        return undefined;
    }
}

app.use(
    '/api',
    ZenStackMiddleware({
        getPrisma: (req) => {
            return withPresets(prisma, { user: getUser(req) });
        },
        handler: RestApiHandler({ endpoint: 'http://localhost:3000/api' }),
    })
);

export default app;
