const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    athleteEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    athleteName: {
        type: String,
        required: true,
        trim: true
    },
    filledPdfFileName: {
        type: String,
        required: true
    },
    paymentRequired: {
        type: Boolean,
        default: false
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Manual Uploaded', 'Confirmed', 'Failed'],
        default: 'Pending'
    },
    transactionId: String,
    paymentSlipFileName: String, // For manual upload cases
    receiptFileName: String, // For generated PDF
    registeredAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Registration', registrationSchema);
