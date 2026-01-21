const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cron = require('node-cron');

const app = express();
const PORT = 3000;
const ESPO_URL = 'http://espocrm'; // Internal Docker URL
const BACKUP_DIR = '/backups';
const SCRIPTS_DIR = '/scripts';

app.use(express.json());
app.use(express.static('public'));

// Serve backup files (secured by same auth requirement in a real app, but for now we rely on the dashboard UI flow)
// In a stricter setup, we would implement session middleware.
// For this "sidecar" simplicity, we'll assume access to this pod via Nginx /backup is the gate, 
// and the UI handles the "login" state to show controls. 
// Ideally, every execute/download request should validate credentials again or use a session token.
// To keep it simple but functional as requested:
// We will require a custom header 'X-Espo-Auth' with base64 creds for sensitive ops if we wanted strictness.
// For now, let's implement a simple in-memory session or just pass creds with every request?
// Passing creds with every request is stateless and easier.

async function validateCreds(username, password) {
    try {
        const response = await axios.get(`${ESPO_URL}/api/v1/App/user`, {
            auth: { username, password }
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (await validateCreds(username, password)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Middleware to check creds for sensitive routes (sent in headers)
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No credentials provided' });

    const [type, creds] = authHeader.split(' ');
    if (type !== 'Basic') return res.status(401).json({ error: 'Invalid auth type' });

    const [username, password] = Buffer.from(creds, 'base64').toString().split(':');

    if (await validateCreds(username, password)) {
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
};

app.get('/api/backups', authMiddleware, (req, res) => {
    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read backup dir' });

        // Group by timestamp
        const backups = {};
        files.forEach(file => {
            const match = file.match(/_(.+)\.(sql|tar\.gz)$/);
            if (match) {
                const ts = match[1];
                if (!backups[ts]) backups[ts] = { timestamp: ts, files: [] };
                backups[ts].files.push(file);
            }
        });

        res.json(Object.values(backups).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    });
});

app.post('/api/trigger-backup', authMiddleware, (req, res) => {
    exec(`${SCRIPTS_DIR}/backup.sh`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Backup error: ${error}`);
            return res.status(500).json({ success: false, message: stderr });
        }
        res.json({ success: true, message: 'Backup created successfully' });
    });
});

// Restore Endpoint
app.post('/api/restore', authMiddleware, (req, res) => {
    const { timestamp } = req.body;
    if (!timestamp) return res.status(400).json({ error: 'Timestamp required' });

    // Restore might take time and kill the connection if we restart services?
    // Actually, this container (backup-dashboard) is separate, but we are restarting the EspoCRM container.
    // That's fine, this service stays up.

    exec(`${SCRIPTS_DIR}/restore.sh ${timestamp}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Restore error: ${error}`);
            return res.status(500).json({ success: false, message: stderr });
        }
        res.json({ success: true, message: 'Restore completed successfully' });
    });
});

// Download Route (Authenticated via query param for simplicity in browser download, or strictly header with blob handling)
// For browser download, utilizing a simple "token" or just Basic Auth popup would be standard.
// Let's implement a specific download endpoint that accepts the Basic Auth header logic if called via XHR to get a Blob,
// OR standard Basic Auth via browser prompt.
app.get('/api/download/:filename', async (req, res) => {
    // Validate Basic Auth from standard header
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const [type, creds] = authHeader.split(' ');
        if (type === 'Basic') {
            const [username, password] = Buffer.from(creds, 'base64').toString().split(':');
            if (await validateCreds(username, password)) {
                const filePath = path.join(BACKUP_DIR, req.params.filename);
                if (fs.existsSync(filePath)) {
                    return res.download(filePath);
                } else {
                    return res.status(404).send('File not found');
                }
            }
        }
    }

    // If no header or invalid, challenge (browser will show login prompt)
    res.set('WWW-Authenticate', 'Basic realm="Backup Download"');
    res.status(401).send('Authentication required');
});

// Schedule Daily Backup at 2 AM
cron.schedule('0 2 * * *', () => {
    console.log('Running scheduled backup...');
    exec(`${SCRIPTS_DIR}/backup.sh`, (err, stdout, stderr) => {
        if (err) console.error('Scheduled backup failed:', stderr);
        else console.log('Scheduled backup success:', stdout);
    });
});

app.listen(PORT, () => {
    console.log(`Backup Dashboard running on port ${PORT}`);
});
