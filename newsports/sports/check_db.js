const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Event = require('./models/Event');

async function checkEvents() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const events = await Event.find();
        console.log('--- ALL EVENTS IN MONGODB ---');
        console.log(JSON.stringify(events, null, 2));
        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkEvents();
