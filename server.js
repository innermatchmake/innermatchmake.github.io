require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const MongoStore = require('connect-mongo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/innermatch';
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

mongoose.connect(MONGO_URL).then(() => console.log('✅ DB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    steamId: String, displayName: String, avatar: String,
    role: { type: String, default: 'user' },
    isVerified: { type: Boolean, default: false },
    country: { type: String, default: 'ua' },
    description: { type: String, default: '' },
    wins: { type: Number, default: 0 }, matches: { type: Number, default: 0 },
    kd: { type: Number, default: 1.00 },
    friends: { type: Array, default: [] }, // Массив steamId друзей
    matchHistory: { type: Array, default: [] }
}));

const store = (typeof MongoStore.create === 'function') 
    ? MongoStore.create({ mongoUrl: MONGO_URL }) 
    : MongoStore.default.create({ mongoUrl: MONGO_URL });

app.use(session({
    secret: 'inner_secret_2026',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.static(__dirname));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { const user = await User.findById(id); done(null, user); } catch(e) { done(e, null); }
});

passport.use(new SteamStrategy({
    returnURL: `${DOMAIN}/auth/steam/return`,
    realm: `${DOMAIN}/`,
    apiKey: process.env.STEAM_API_KEY
}, async (identifier, profile, done) => {
    try {
        let user = await User.findOne({ steamId: profile.id });
        if (!user) user = await User.create({ steamId: profile.id, displayName: profile.displayName, avatar: profile.photos[2].value });
        return done(null, user);
    } catch (e) { return done(e, null); }
}));

// МАРШРУТЫ АВТОРИЗАЦИИ
app.get('/auth/steam', passport.authenticate('steam'));
app.get('/auth/steam/return', passport.authenticate('steam', { failureRedirect: '/' }), (req, res) => res.redirect('/profile'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// МАРШРУТЫ ПОЛЬЗОВАТЕЛЯ
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/profile', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'profile.html')) : res.redirect('/'));
app.get('/friends', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'friends.html')) : res.redirect('/'));
app.get('/api/user', (req, res) => res.json(req.user || null));

// --- ЛОГИКА ДРУЗЕЙ И ПОИСКА ---

// Поиск пользователей по нику
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    const users = await User.find({ displayName: { $regex: query, $options: 'i' } }).limit(10);
    res.json(users);
});

// Получение списка друзей
app.get('/api/friends', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    // Находим всех пользователей, чьи steamId есть в списке друзей текущего юзера
    const friends = await User.find({ steamId: { $in: req.user.friends } });
    res.json(friends);
});

// Добавление в друзья
app.post('/api/friends/add', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const targetId = req.body.steamId;
    if (!req.user.friends.includes(targetId)) {
        await User.findByIdAndUpdate(req.user._id, { $push: { friends: targetId } });
    }
    res.json({ success: true });
});

app.post('/api/update-profile', async (req, res) => {
    if (req.isAuthenticated()) { await User.findByIdAndUpdate(req.user._id, req.body); res.json({success:true}); }
});

app.get('/u/:id', async (req, res) => {
    try { const user = await User.findOne({ steamId: req.params.id }); res.json(user); } catch (e) { res.status(404).json(null); }
});

// SOCKET.IO (Матчмейкинг) - оставляем без изменений
let queue = [];
io.on('connection', (socket) => {
    socket.emit('queueUpdate', queue.length);
    socket.on('disconnect', () => {
        queue = queue.filter(p => p.socketId !== socket.id);
        io.emit('queueUpdate', queue.length);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));