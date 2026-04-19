const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');
const Event = require('./models/Event');

const USERS_DB = path.join(__dirname, 'db.json');
const EVENTS_DB = path.join(__dirname, 'events.json');

function readJSON(file) {
    if (fs.existsSync(file)) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
    }
    return [];
}

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const oldUsers = readJSON(USERS_DB);
        const oldEvents = readJSON(EVENTS_DB);

        for (const u of oldUsers) {
            await User.findOneAndUpdate(
                { email: u.email.toLowerCase() },
                {
                    fullName: u.name,
                    email: u.email.toLowerCase(),
                    governmentId: u.idNumber || 'MIGRATED',
                    role: u.role,
                    password: 'temporary-placeholder'
                },
                { upsert: true, new: true }
            );
        }
        for (const e of oldEvents) {
            await Event.findOneAndUpdate(
                { eventName: e.eventName },
                { ...e, date: new Date(e.date) },
                { upsert: true, new: true }
            );
        }
        console.log('Migration with db.json success!');
        process.exit(0);
    } catch (err) { console.error(err); process.exit(1); }
}
migrate();
