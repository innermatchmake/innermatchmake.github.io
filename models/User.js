const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    steamId: { type: String, unique: true }, // Уникальный ID из Steam
    displayName: String,
    avatar: String,
    description: { type: String, default: "Новый игрок INNERMATCH" },
    country: { type: String, default: "un" },
    wins: { type: Number, default: 0 },
    matches: { type: Number, default: 0 },
    kd: { type: Number, default: 0.00 },
    history: [
        {
            map: String,
            score: String,
            date: { type: Date, default: Date.now }
        }
    ]
});

module.exports = mongoose.model('User', UserSchema);