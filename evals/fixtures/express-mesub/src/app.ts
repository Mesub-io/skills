import express from 'express';
import { exportFor } from './exports.js';
import { requirePro, widgetRoutes } from './mesub.js';
import { reportsFor } from './reports.js';
import { login, logout, requireUser, session } from './session.js';

export const app = express();

app.use(express.json());
app.use(session);

app.use('/api/mesub', widgetRoutes);

app.post('/login', login);
app.post('/logout', logout);
app.get('/me', requireUser, (req, res) => {
    res.json({ user: req.user });
});

// Not paid yet: anyone who is signed in reads the reports.
app.get('/api/reports', requireUser, (req, res) => {
    res.json({ reports: reportsFor(req.user!) });
});

// Paid: subscribers of the Pro plan only. The guard answers 401, 402 and 503 itself.
app.get('/api/exports', requirePro, (req, res) => {
    res.type('text/csv').send(exportFor(req.user!));
});
