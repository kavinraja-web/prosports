require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const connectDB = require('./config/db');
const User     = require('./models/User');
const Event    = require('./models/Event');
const Registration = require('./models/Registration');

// Connect to database
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api/auth', require('./routes/authRoutes'));

// ─────────────────────────────────────────────
//  Static file serving for uploaded PDFs
// ─────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
app.use('/uploads', express.static(UPLOADS_DIR));

// ─────────────────────────────────────────────
//  Multer – PDF upload config
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename:    (req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}_${safe}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only PDF or Image files are allowed'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
});

// JSON DBs (Deprecated - transitioning to MongoDB)
const USERS_DB  = path.join(__dirname, 'db.json');
const EVENTS_DB = path.join(__dirname, 'events.json');
const REGISTRATIONS_DB = path.join(__dirname, 'registrations.json');

function readJSON(filePath, defaultVal = []) {
    try {
        if (!fs.existsSync(filePath)) return defaultVal;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return defaultVal; }
}

// ─────────────────────────────────────────────
//  Verhoeff Algorithm (Aadhaar checksum)
// ─────────────────────────────────────────────
function verhoeffCheck(num) {
    const d = [
        [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
        [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
        [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
        [9,8,7,6,5,4,3,2,1,0]
    ];
    const p = [
        [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
        [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
        [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
    ];
    const digits = String(num).split('').reverse().map(Number);
    let check = 0;
    for (let i = 0; i < digits.length; i++) check = d[check][p[i % 8][digits[i]]];
    return check === 0;
}

// ─────────────────────────────────────────────
//  Email Validation (local)
// ─────────────────────────────────────────────
const DISPOSABLE = new Set([
    'mailinator.com','guerrillamail.com','temp-mail.org','throwam.com','fakeinbox.com',
    'sharklasers.com','spam4.me','trashmail.com','trashmail.me','yopmail.com','yopmail.fr',
    'tempr.email','dispostable.com','mailnull.com','tempmail.com','tempmail.net',
    'discard.email','getnada.com','maildrop.cc','10minutemail.com','throwaway.email'
]);
function validateEmail(email) {
    const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!re.test(email)) return { valid: false, reason: 'Email format is invalid' };
    if (DISPOSABLE.has(email.split('@')[1].toLowerCase()))
        return { valid: false, reason: 'Disposable emails are not allowed' };
    return { valid: true, reason: 'OK' };
}

// ─────────────────────────────────────────────
//  ID Validation (Aadhaar / Passport)
// ─────────────────────────────────────────────
function validateId(idNumber) {
    const c = idNumber.replace(/\s/g, '');
    if (/^\d{12}$/.test(c)) {
        if (['0','1'].includes(c[0])) return { valid: false, type: 'Aadhaar', reason: 'Aadhaar cannot start with 0 or 1' };
        if (!verhoeffCheck(c))        return { valid: false, type: 'Aadhaar', reason: 'Aadhaar checksum invalid – number does not exist' };
        return { valid: true, type: 'Aadhaar', reason: 'Valid Aadhaar' };
    }
    if (/^[A-Za-z]\d{7}$/.test(c)) return { valid: true, type: 'Passport', reason: 'Valid Passport' };
    return { valid: false, type: 'Unknown', reason: 'Must be 12-digit Aadhaar or Passport like A1234567' };
}

// ─────────────────────────────────────────────
//  USER ENDPOINTS (Modernized for MongoDB)
// ─────────────────────────────────────────────
app.get('/check-email', async (req, res) => {
    const email = (req.query.email || '').toLowerCase().trim();
    const role  = (req.query.role || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
        let filter = { email };
        if (role) filter.role = new RegExp(`^${role}$`, 'i'); // Case-insensitive role check

        const user = await User.findOne(filter);
        if (user) res.json({ exists: true, user: { name: user.fullName, email: user.email, role: user.role, idType: 'Registered' } });
        else res.json({ exists: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/login', async (req, res) => {
    const email = (req.body.email || '').toLowerCase().trim();
    const role  = (req.body.role || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
        let filter = { email };
        if (role) filter.role = new RegExp(`^${role}$`, 'i');

        const user = await User.findOne(filter);
        if (!user) return res.status(404).json({ error: `No ${role || 'account'} found for this email. Please register first.` });
        res.json({ message: `Welcome back, ${user.fullName}!`, user: { name: user.fullName, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/register', async (req, res) => {
    const { name, email, idNumber, role } = req.body;
    if (!name || !email || !idNumber || !role) return res.status(400).json({ error: 'All fields are required.' });
    
    const eCheck = validateEmail(email);
    if (!eCheck.valid) return res.status(400).json({ error: `Email: ${eCheck.reason}` });

    try {
        const emailLow = email.toLowerCase().trim();
        const existing = await User.findOne({ email: emailLow });
        if (existing) return res.status(400).json({ error: 'Email already registered.' });

        // Using placeholder password for simple port-over logic
        const user = await User.create({
            fullName: name.trim(),
            email: emailLow,
            governmentId: idNumber.replace(/\s/g,''),
            role: role,
            password: 'temporary-placeholder' 
        });

        res.json({ message: 'Registration successful!', user: { name: user.fullName, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /events  – Official creates an event
app.post('/events', upload.single('registrationForm'), async (req, res) => {
    console.log('--- EVENT CREATION REQUEST ---');
    console.log('Body:', req.body);
    console.log('File:', req.file ? req.file.filename : 'No file');

    const { eventName, sport, eventType, date, venueName, mapsLink, category, officialEmail, officialName } = req.body;

    if (!eventName || !sport || !eventType || !date || !venueName || !category || !officialEmail) {
        console.error('❌ Missing required fields');
        return res.status(400).json({ error: 'All event fields are required.' });
    }

    try {
        const newEvent = await Event.create({
            eventName: eventName.trim(),
            sport,
            eventType,
            date,
            venueName: venueName.trim(),
            mapsLink: mapsLink || '',
            category,
            officialEmail: officialEmail.toLowerCase(),
            officialName,
            registrationFee: 0,
            paymentRequired: false,
            pdfFileName: req.file ? req.file.filename : null,
            pdfOrigName: req.file ? req.file.originalname : null
        });

        console.log('✅ Event Created:', newEvent.eventName);
        res.json({ message: 'Event created successfully!', event: newEvent });
    } catch (err) { 
        console.error('❌ Event Create Error:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// GET /events  – public listing
app.get('/events', async (req, res) => {
    try {
        let filter = {};
        if (req.query.sport)     filter.sport = req.query.sport;
        if (req.query.eventType) filter.eventType = req.query.eventType;
        if (req.query.official)  filter.officialEmail = req.query.official.toLowerCase();

        const events = await Event.find(filter).sort({ createdAt: -1 });
        res.json(events);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /events/:id/form  – download the blank PDF
app.get('/events/:id/form', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event || !event.pdfFileName) return res.status(404).json({ error: 'Form not found.' });
        res.download(path.join(UPLOADS_DIR, event.pdfFileName), event.pdfOrigName || 'form.pdf');
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /events/:id  – Official deletes own event
app.delete('/events/:id', async (req, res) => {
    const email = (req.body.officialEmail || '').toLowerCase();
    try {
        const event = await Event.findOneAndDelete({ _id: req.params.id, officialEmail: email });
        if (!event) return res.status(403).json({ error: 'Unauthorized or not found.' });
        if (event.pdfFileName) fs.unlinkSync(path.join(UPLOADS_DIR, event.pdfFileName));
        res.json({ message: 'Event deleted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PDFDocument = require('pdfkit');

// POST /events/:id/register  – Athlete registers (initial step)
app.post('/events/:id/register', upload.single('filledForm'), async (req, res) => {
    const { athleteEmail, athleteName } = req.body;
    const eventId = req.params.id;

    if (!athleteEmail || !athleteName || !req.file) {
        return res.status(400).json({ error: 'Details and PDF form are required.' });
    }

    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ error: 'Event not found.' });

        const existing = await Registration.findOne({ eventId, athleteEmail: athleteEmail.toLowerCase() });
        if (existing) return res.status(400).json({ error: 'Already registered for this event.' });

        const reg = await Registration.create({
            eventId,
            athleteEmail: athleteEmail.toLowerCase(),
            athleteName,
            filledPdfFileName: req.file.filename,
            paymentRequired: false,
            paymentStatus: 'Confirmed'
        });

        res.json({ 
            message: 'Successfully registered!', 
            registration: reg 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /events/:id/registrations – Official views participants
app.get('/events/:id/registrations', async (req, res) => {
    const email = (req.query.officialEmail || '').toLowerCase();
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found.' });
        if (event.officialEmail !== email) return res.status(403).json({ error: 'Unauthorized.' });

        const regs = await Registration.find({ eventId: req.params.id });
        res.json(regs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

async function generateReceipt(regId) {
    try {
        const reg = await Registration.findById(regId).populate('eventId');
        const doc = new PDFDocument();
        const fileName = `registration_${reg._id}.pdf`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        
        doc.pipe(fs.createWriteStream(filePath));
        
        doc.fontSize(25).text('PROSPORTS REGISTRATION CONFIRMATION', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Event: ${reg.eventId.eventName}`);
        doc.text(`Athlete: ${reg.athleteName}`);
        doc.text(`Email: ${reg.athleteEmail}`);
        doc.text(`Status: REGISTERED`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();
        doc.text('Thank you for choosing ProSports!', { align: 'center', color: 'blue' });
        
        doc.end();
        
        reg.receiptFileName = fileName;
        await reg.save();
    } catch (err) { console.error('PDF Gen Error:', err); }
}

app.get('/registrations/:id/receipt', async (req, res) => {
    try {
        const reg = await Registration.findById(req.params.id);
        if (!reg || !reg.receiptFileName) return res.status(404).json({ error: 'Receipt not found.' });
        res.download(path.join(UPLOADS_DIR, reg.receiptFileName));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/registrations/:id/upload-slip', upload.single('paymentSlip'), async (req, res) => {
    try {
        const reg = await Registration.findById(req.params.id);
        if (!reg) return res.status(404).json({ error: 'Registration not found.' });
        
        reg.paymentSlipFileName = req.file.filename;
        reg.paymentStatus = 'Manual Uploaded';
        await reg.save();
        
        res.json({ message: 'Payment slip uploaded successfully! Waiting for verification.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/my-registrations', async (req, res) => {
    const email = (req.query.email || '').toLowerCase();
    try {
        const regs = await Registration.find({ athleteEmail: email }).populate('eventId');
        res.json(regs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /extract-location – Unshorten maps link and extract venue name
const https = require('https');
app.get('/extract-location', (req, res) => {
    let url = req.query.url;
    if (!url) return res.json({ name: '' });

    // Reverse geocode if Google gave us coordinates instead of a name
    const reverseGeocode = (lat, lon, fallback, callback) => {
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/reverse?format=json&lat=${lat}&lon=${lon}`,
            headers: { 'User-Agent': 'ProSports-AutoFill-App' } // Required by Nominatim
        };
        https.get(options, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.display_name) {
                        // Return the first 2 or 3 parts of the address for a clean venue name
                        const parts = json.display_name.split(',');
                        return callback(parts.slice(0, Math.min(3, parts.length)).join(',').trim());
                    }
                } catch (e) {}
                callback(fallback);
            });
        }).on('error', () => callback(fallback));
    };

    const processExtractedName = (rawName) => {
        if (!rawName) return res.json({ name: '' });
        let decoded = rawName;
        try { decoded = decodeURIComponent(rawName.replace(/\+/g, ' ')).split('@')[0]; } 
        catch { decoded = rawName.replace(/\+/g, ' ').split('@')[0]; }
        
        // Detect if the string is just coordinates: e.g. "9.167474, 77.875215"
        const coordMatch = decoded.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
        if (coordMatch) {
            reverseGeocode(coordMatch[1], coordMatch[2], decoded, (geocodeName) => {
                res.json({ name: geocodeName });
            });
        } else {
            res.json({ name: decoded });
        }
    };

    const extractNamePart = (fullUrl) => {
        // Handles /place/Name or '?query=Name' 
        const matchPlace = fullUrl.match(/\/(?:place|search)\/([^\/?]+)/);
        if (matchPlace && matchPlace[1]) return matchPlace[1];
        try {
            const urlObj = new URL(fullUrl);
            const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q');
            if (query) return query;
        } catch (e) {}
        return '';
    };

    try { new URL(url); } catch { return res.json({ name: '' }); }

    // If it's a full link, extract immediately
    if (!url.includes('maps.app.goo.gl') && !url.includes('goo.gl/maps')) {
        return processExtractedName(extractNamePart(url));
    }

    // Follow redirect for short links
    https.get(url, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
            return processExtractedName(extractNamePart(response.headers.location));
        }
        processExtractedName(extractNamePart(url));
    }).on('error', () => res.json({ name: '' }));
});

// ─────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'src')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Modern Backend on port ${PORT}`);
    try {
        const uCount = await User.countDocuments();
        const eCount = await Event.countDocuments();
        console.log(`👥 MongoDB Users: ${uCount}  |  📅 MongoDB Events: ${eCount}`);
    } catch (err) {
        console.error('⚠️ Could not fetch MongoDB counts:', err.message);
    }
});