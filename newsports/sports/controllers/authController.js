const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register a new official
// @route   POST /api/auth/register-official
// @access  Public
const registerOfficial = async (req, res) => {
    const { fullName, email, password, governmentId } = req.body;

    // Check missing fields
    if (!fullName || !email || !password || !governmentId) {
        return res.status(400).json({ message: 'Please provide all required fields (fullName, email, password, governmentId)' });
    }

    try {
        // Validate fullName
        if (fullName.trim() === '') {
            return res.status(400).json({ message: 'Full name cannot be empty' });
        }

        // Validate Aadhaar (12 digits) or Passport (starts with letter, 7 digits usually but we'll use alphanumeric validation as requested or similar to previous logic)
        const cleanId = governmentId.replace(/[\s\-_]/g, '');
        const isAadhaar = /^\d{12}$/.test(cleanId) && !['0', '1'].includes(cleanId[0]);
        const isPassport = /^[A-Za-z]\d{7}$/.test(cleanId);
        
        if (!isAadhaar && !isPassport) {
            return res.status(400).json({ message: 'Invalid Aadhaar or Passport format' });
        }

        // Check if user exists
        const emailLow = email.toLowerCase().trim();
        const userExists = await User.findOne({ email: emailLow });
        if (userExists) {
            return res.status(400).json({ message: 'Email is already registered' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            fullName: fullName.trim(),
            email: emailLow,
            password: hashedPassword,
            governmentId: cleanId,
        });

        if (user) {
            res.status(201).json({
                message: 'Registration successful',
                user: {
                    _id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    governmentId: user.governmentId,
                    isEmailVerified: user.isEmailVerified,
                },
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data received' });
        }
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Duplicate value entered, email already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide email and password' });
    }

    try {
        const emailLow = email.toLowerCase().trim();
        const user = await User.findOne({ email: emailLow });

        if (user && (await bcrypt.compare(password, user.password))) {
            
            // Note: Placeholder logic for email verification
            // if (!user.isEmailVerified) {
            //     return res.status(401).json({ message: 'Please verify your email before logging in' });
            // }

            res.json({
                message: 'Login successful',
                user: {
                    _id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified,
                },
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (user) {
            res.json({ user });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    registerOfficial,
    login,
    getProfile
};
