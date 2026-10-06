import express from 'express';
import { reportsFor } from './reports.js';
import { login, logout, requireUser, session } from './session.js';

export const app = express();

app.use(express.json());
app.use(session);

app.post('/login', login);
app.post('/logout', logout);
app.get('/me', requireUser, (req, res) => {
    res.json({ user: req.user });
});

// The route to protect: today anyone who is signed in reads the reports.
app.get('/api/reports', requireUser, (req, res) => {
    res.json({ reports: reportsFor(req.user!) });
});
