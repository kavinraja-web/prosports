const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    eventName: {
        type: String,
        required: true,
        trim: true
    },
    sport: {
        type: String,
        required: true,
        enum: ['Cricket', 'Football', 'Kabaddi', 'Track & Field', 'Marathon']
    },
    eventType: {
        type: String,
        required: true,
        enum: ['Sports', 'Marathon']
    },
    date: {
        type: Date,
        required: true
    },
    venueName: {
        type: String,
        required: true,
        trim: true
    },
    mapsLink: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    officialEmail: {
        type: String,
        required: true,
        lowercase: true
    },
    officialName: {
        type: String,
        required: true
    },
    registrationFee: {
        type: Number,
        default: 0
    },
    paymentRequired: {
        type: Boolean,
        default: false
    },
    pdfFileName: String,
    pdfOrigName: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('Event', eventSchema);
