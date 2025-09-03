// متغيرات عامة
let socket;
let currentUser = null;
let token = localStorage.getItem('chatToken');
let currentRoomId = 1;
let selectedUserId = null;
let currentPrivateChatUser = null;

// الرتب المتاحة
const RANKS = {
    visitor: { name: 'زائر', emoji: '👋', level: 0 },
    bronze: { name: 'عضو برونزي', emoji: '🥉', level: 1 },
    silver: { name: 'عضو فضي', emoji: '🥈', level: 2 },
    gold: { name: 'عضو ذهبي', emoji: '🥇', level: 3 },
    trophy: { name: 'كأس', emoji: '🏆', level: 4 },
    diamond: { name: 'عضو الماس', emoji: '💎', level: 5 },
    prince: { name: 'برنس', emoji: '👑', level: 6 }
};

// التحقق من التوكن عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    if (token) {
        validateToken();
    } else {
        showLoginScreen();
    }
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // إرسال الرسائل بالضغط على Enter
    document.getElementById('messageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // إرسال الرسائل الخاصة بالضغط على Enter
    document.getElementById('privateMessageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPrivateMessage();
        }
    });
}

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.form').forEach(form => form.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Form').classList.add('active');
    document.getElementById('loginError').textContent = '';
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('chatScreen').classList.remove('active');
}

function showChatScreen() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('chatScreen').classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('chatToken', token);
            showChatScreen();
            setupChat();
        } else {
            document.getElementById('loginError').textContent = data.error;
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'خطأ في الاتصال';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const displayName = document.getElementById('registerDisplayName').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, display_name: displayName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('chatToken', token);
            showChatScreen();
            setupChat();
        } else {
            document.getElementById('loginError').textContent = data.error;
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'خطأ في الاتصال';
    }
}

async function validateToken() {
    try {
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            showChatScreen();
            setupChat();
        } else {
            localStorage.removeItem('chatToken');
            token = null;
            showLoginScreen();
        }
    } catch (error) {
        localStorage.removeItem('chatToken');
        token = null;
        showLoginScreen();
    }
}

function setupChat() {
    updateUserInfo();
    connectSocket();
    loadRooms();
    loadMessages(currentRoomId);
    
    if (currentUser.role === 'admin') {
        document.getElementById('adminBtn').style.display = 'block';
        document.getElementById('createRoomBtn').style.display = 'block';
    }
}

function updateUserInfo() {
    document.getElementById('userDisplayName').textContent = currentUser.display_name;
    
    const rankInfo = RANKS[currentUser.rank] || RANKS.visitor;
    document.getElementById('userRank').textContent = `${rankInfo.emoji} ${rankInfo.name}`;
    
    if (currentUser.profile_image1) {
        document.getElementById('userAvatar').src = currentUser.profile_image1;
    }
}

function connectSocket() {
    socket = io();
    
    socket.emit('join', {
        userId: currentUser.id,
        displayName: currentUser.display_name,
        rank: currentUser.rank,
        email: currentUser.email,
        roomId: currentRoomId
    });
    
    socket.on('newMessage', (message) => {
        if (message.room_id === currentRoomId) {
            displayMessage(message);
            
            // تشغيل صوت الرسائل العامة
            if (message.user_id !== currentUser.id) {
                playMessageSound();
                
                // فحص الإشارات
                if (message.message.includes(`@${currentUser.display_name}`)) {
                    playMentionSound();
                    showMentionNotification(message);
                }
            }
        }
    });
    
    socket.on('roomUsersList', (users) => {
        updateUsersList(users);
    });
    
    socket.on('newPrivateMessage', (message) => {
        if (currentPrivateChatUser && 
            (message.user_id === currentPrivateChatUser.userId || message.receiver_id === currentPrivateChatUser.userId)) {
            displayPrivateMessage(message);
        }
        
        // تشغيل صوت الرسائل الخاصة
        if (message.user_id !== currentUser.id) {
            playPrivateMessageSound();
            
            // عرض إشعار للرسائل الخاصة
            if (Notification.permission === 'granted') {
                const notification = new Notification(`رسالة خاصة من ${message.display_name}`, {
                    body: message.message,
                    icon: message.profile_image1 || '/default-avatar.png'
                });
                setTimeout(() => notification.close(), 5000);
            }
        }
    });

    socket.on('roomChanged', (newRoomId) => {
        currentRoomId = newRoomId;
        loadMessages(newRoomId);
    });
}

async function loadRooms() {
    try {
        const response = await fetch('/api/rooms', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const rooms = await response.json();
            updateRoomsList(rooms);
        }
    } catch (error) {
        console.error('خطأ في تحميل الغرف:', error);
    }
}

function updateRoomsList(rooms) {
    const roomsList = document.getElementById('roomsList');
    roomsList.innerHTML = '';
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = `room-item ${room.id === currentRoomId ? 'active' : ''}`;
        roomItem.onclick = () => changeRoom(room.id, room.name);
        
        const roomIcon = room.name.charAt(0).toUpperCase();
        
        roomItem.innerHTML = `
            <div class="room-item-icon">${roomIcon}</div>
            <div class="room-item-info">
                <div class="room-item-name">${room.name}</div>
                <div class="room-item-desc">${room.description || 'غرفة دردشة'}</div>
            </div>
        `;
        
        roomsList.appendChild(roomItem);
    });
}

function changeRoom(roomId, roomName) {
    if (roomId === currentRoomId) return;
    
    currentRoomId = roomId;
    document.getElementById('currentRoomName').textContent = roomName;
    
    // تحديث الغرف النشطة
    document.querySelectorAll('.room-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // إخبار السيرفر بتغيير الغرفة
    socket.emit('changeRoom', roomId);
    
    // مسح الرسائل وتحميل رسائل الغرفة الجديدة
    document.getElementById('messagesContainer').innerHTML = '';
    loadMessages(roomId);
}

async function loadMessages(roomId) {
    try {
        const response = await fetch(`/api/messages/${roomId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            messages.forEach(message => displayMessage(message));
        }
    } catch (error) {
        console.error('خطأ في تحميل الرسائل:', error);
    }
}

function updateUsersList(users) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';
    
    users.forEach(user => {
        if (user.userId === currentUser.id) return;
        
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.onclick = () => openPrivateChat(user);
        
        const rankInfo = RANKS[user.rank] || RANKS.visitor;
        
        userItem.innerHTML = `
            <img src="${user.profile_image1 || getDefaultAvatar()}" alt="صورة شخصية">
            <div class="user-item-info">
                <div class="user-item-name">${user.displayName}</div>
                <div class="user-item-rank">${rankInfo.emoji} ${rankInfo.name}</div>
            </div>
        `;
        
        usersList.appendChild(userItem);
    });
}

// متغير عام لحفظ الرسالة المقتبسة
let quotedMessage = null;

function displayMessage(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageElement = document.createElement('div');
    
    const isOwn = message.user_id === currentUser.id;
    messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
    messageElement.setAttribute('data-message-id', message.id);
    
    // إضافة خلفية الرسالة إذا كانت موجودة
    if (message.message_background) {
        messageElement.style.backgroundImage = `url(${message.message_background})`;
        messageElement.classList.add('has-background');
    }
    
    const rankInfo = RANKS[message.rank] || RANKS.visitor;
    const time = new Date(message.timestamp).toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-header">
            <img src="${message.profile_image1 || getDefaultAvatar()}" alt="صورة شخصية" class="message-avatar clickable-avatar" onclick="viewUserProfile('${message.user_id}', '${message.display_name}')">
            <span class="message-author">${message.display_name}</span>
            <span class="message-rank">${rankInfo.emoji} ${rankInfo.name}</span>
            <span class="message-time">${time}</span>
            <div class="message-actions">
                <button class="quote-btn" onclick="quoteMessage('${message.id}', '${message.display_name}', \`${escapeHtml(message.message).replace(/`/g, '\\`')}\`)" title="اقتباس">
                    📋
                </button>
            </div>
        </div>
        ${message.quoted_message ? `
            <div class="quoted-message">
                <div class="quote-author">💬 ${message.quoted_author}:</div>
                <div class="quote-content">${escapeHtml(message.quoted_message)}</div>
            </div>
        ` : ''}
        <div class="message-content">${escapeHtml(message.message)}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    const messageData = {
        message: message,
        roomId: currentRoomId
    };
    
    // إضافة بيانات الاقتباس إذا وجدت
    if (quotedMessage) {
        messageData.quoted_message_id = quotedMessage.id;
        messageData.quoted_message = quotedMessage.content;
        messageData.quoted_author = quotedMessage.author;
    }
    
    socket.emit('sendMessage', messageData);
    
    messageInput.value = '';
    clearQuote(); // مسح الاقتباس بعد الإرسال
}

// وظائف الإشعارات
function showMentionNotification(message) {
    if (Notification.permission === 'granted') {
        const notification = new Notification(`إشارة من ${message.display_name}`, {
            body: message.message,
            icon: message.profile_image1 || '/default-avatar.png'
        });
        
        setTimeout(() => notification.close(), 5000);
    }
}

// طلب إذن الإشعارات
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// عرض إعدادات الأصوات
function openSoundSettings() {
    const settingsModal = document.createElement('div');
    settingsModal.className = 'modal active';
    settingsModal.id = 'soundSettingsModal';
    
    const messageSoundsEnabled = localStorage.getItem('messageSoundsEnabled') !== 'false';
    const privateSoundsEnabled = localStorage.getItem('privateSoundsEnabled') !== 'false';
    const mentionSoundsEnabled = localStorage.getItem('mentionSoundsEnabled') !== 'false';
    
    settingsModal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeSoundSettings()">&times;</span>
            <h2>🔊 إعدادات الأصوات</h2>
            
            <div class="sound-settings">
                <div class="sound-setting">
                    <label>
                        <input type="checkbox" id="messageSounds" ${messageSoundsEnabled ? 'checked' : ''}>
                        أصوات الرسائل العامة
                    </label>
                    <button onclick="testMessageSound()" class="test-sound-btn">تجربة</button>
                </div>
                
                <div class="sound-setting">
                    <label>
                        <input type="checkbox" id="privateSounds" ${privateSoundsEnabled ? 'checked' : ''}>
                        أصوات الرسائل الخاصة
                    </label>
                    <button onclick="testPrivateSound()" class="test-sound-btn">تجربة</button>
                </div>
                
                <div class="sound-setting">
                    <label>
                        <input type="checkbox" id="mentionSounds" ${mentionSoundsEnabled ? 'checked' : ''}>
                        أصوات الإشارات
                    </label>
                    <button onclick="testMentionSound()" class="test-sound-btn">تجربة</button>
                </div>
                
                <div class="sound-setting">
                    <button onclick="requestNotificationPermission()" class="btn">
                        🔔 تفعيل الإشعارات
                    </button>
                </div>
            </div>
            
            <div class="sound-actions">
                <button onclick="saveSoundSettings()" class="btn save-btn">حفظ الإعدادات</button>
                <button onclick="closeSoundSettings()" class="btn cancel-btn">إلغاء</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(settingsModal);
}

function closeSoundSettings() {
    const modal = document.getElementById('soundSettingsModal');
    if (modal) {
        modal.remove();
    }
}

function saveSoundSettings() {
    const messageSounds = document.getElementById('messageSounds').checked;
    const privateSounds = document.getElementById('privateSounds').checked;
    const mentionSounds = document.getElementById('mentionSounds').checked;
    
    localStorage.setItem('messageSoundsEnabled', messageSounds);
    localStorage.setItem('privateSoundsEnabled', privateSounds);
    localStorage.setItem('mentionSoundsEnabled', mentionSounds);
    
    alert('تم حفظ إعدادات الأصوات!');
    closeSoundSettings();
}

function testMessageSound() {
    playMessageSound();
}

function testPrivateSound() {
    playPrivateMessageSound();
}

function testMentionSound() {
    playMentionSound();
}

// وظائف الإيموجي المتحركة
const animatedEmojis = {
    '😂': 'laugh',
    '😍': 'heart-eyes', 
    '😘': 'kiss',
    '😎': 'cool',
    '😭': 'sob',
    '😡': 'angry',
    '😱': 'shocked',
    '😊': 'happy',
    '👍': 'thumbs-up',
    '👎': 'thumbs-down',
    '❤️': 'heart',
    '🔥': 'fire',
    '✨': 'sparkles',
    '🎉': 'party',
    '💜': 'purple-heart',
    '🌹': 'rose',
    '💫': 'dizzy',
    '🌈': 'rainbow',
    '🎆': 'fireworks',
    '💎': 'gem'
};

function toggleEmojiPanel() {
    const existingPanel = document.querySelector('.emoji-panel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    const emojiPanel = document.createElement('div');
    emojiPanel.className = 'emoji-panel';
    
    let emojiHTML = '<div class="emoji-panel-header">😀 الإيموجي المتحركة</div>';
    emojiHTML += '<div class="emoji-grid">';
    
    Object.keys(animatedEmojis).forEach(emoji => {
        emojiHTML += `<span class="animated-emoji ${animatedEmojis[emoji]}" onclick="insertEmoji('${emoji}')">${emoji}</span>`;
    });
    
    emojiHTML += '</div>';
    emojiPanel.innerHTML = emojiHTML;
    
    const messageInputArea = document.querySelector('.message-input-area');
    messageInputArea.appendChild(emojiPanel);
}

function insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    const currentText = messageInput.value;
    messageInput.value = currentText + emoji;
    messageInput.focus();
    
    // إضافة تأثير انفجار عند الإدراج
    createEmojiExplosion(emoji);
}

function createEmojiExplosion(emoji) {
    const explosion = document.createElement('div');
    explosion.className = 'emoji-explosion';
    explosion.textContent = emoji;
    
    // وضع عشوائي على الشاشة
    explosion.style.left = Math.random() * window.innerWidth + 'px';
    explosion.style.top = Math.random() * window.innerHeight + 'px';
    
    document.body.appendChild(explosion);
    
    // إزالة التأثير بعد 2 ثانية
    setTimeout(() => {
        if (explosion.parentNode) {
            explosion.parentNode.removeChild(explosion);
        }
    }, 2000);
}

// تأثيرات الإيموجي في الرسائل
function addEmojiAnimations() {
    const messages = document.querySelectorAll('.message-content');
    messages.forEach(message => {
        let content = message.innerHTML;
        
        Object.keys(animatedEmojis).forEach(emoji => {
            const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            content = content.replace(regex, `<span class="animated-emoji ${animatedEmojis[emoji]}">${emoji}</span>`);
        });
        
        message.innerHTML = content;
    });
}

// تأثير المطر المتحرك
function createEmojiRain() {
    const rainEmojis = ['✨', '🎆', '🎉', '❤️', '💜', '🌹'];
    
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const rainDrop = document.createElement('div');
            rainDrop.className = 'emoji-rain';
            rainDrop.textContent = rainEmojis[Math.floor(Math.random() * rainEmojis.length)];
            rainDrop.style.left = Math.random() * window.innerWidth + 'px';
            
            document.body.appendChild(rainDrop);
            
            setTimeout(() => {
                if (rainDrop.parentNode) {
                    rainDrop.parentNode.removeChild(rainDrop);
                }
            }, 3000);
        }, i * 100);
    }
}

// تفعيل مطر الإيموجي عند وصول رسائل خاصة
function triggerSpecialEffects(message) {
    if (message.includes('🎉') || message.includes('🎆')) {
        createEmojiRain();
    }
    
    if (message.includes('❤️') && message.includes('💜')) {
        createHeartEffect();
    }
}

function createHeartEffect() {
    const hearts = ['❤️', '💜', '💙', '💚', '💛'];
    
    for (let i = 0; i < 15; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.className = 'floating-heart';
            heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
            heart.style.left = Math.random() * window.innerWidth + 'px';
            heart.style.bottom = '0px';
            
            document.body.appendChild(heart);
            
            setTimeout(() => {
                if (heart.parentNode) {
                    heart.parentNode.removeChild(heart);
                }
            }, 4000);
        }, i * 200);
    }
}

// إدارة الدردشة الخاصة
function openPrivateChat(user) {
    currentPrivateChatUser = user;
    document.getElementById('privateChatUserName').textContent = user.displayName;
    document.getElementById('privateChatModal').classList.add('active');
    document.getElementById('privateChatMessages').innerHTML = '';
    loadPrivateMessages(user.userId);
}

function closePrivateChatModal() {
    document.getElementById('privateChatModal').classList.remove('active');
    currentPrivateChatUser = null;
}

async function loadPrivateMessages(userId) {
    try {
        const response = await fetch(`/api/private-messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            messages.forEach(message => displayPrivateMessage(message));
        }
    } catch (error) {
        console.error('خطأ في تحميل الرسائل الخاصة:', error);
    }
}

function displayPrivateMessage(message) {
    const container = document.getElementById('privateChatMessages');
    const messageElement = document.createElement('div');
    
    const isOwn = message.user_id === currentUser.id;
    messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const rankInfo = RANKS[message.rank] || RANKS.visitor;
    const time = new Date(message.timestamp).toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-header">
            <img src="${message.profile_image1 || getDefaultAvatar()}" alt="صورة شخصية" class="message-avatar">
            <span class="message-author">${message.display_name}</span>
            <span class="message-rank">${rankInfo.emoji} ${rankInfo.name}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(message.message)}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function sendPrivateMessage() {
    const input = document.getElementById('privateMessageInput');
    const message = input.value.trim();
    
    if (!message || !currentPrivateChatUser) return;
    
    socket.emit('sendPrivateMessage', {
        message: message,
        receiverId: currentPrivateChatUser.userId
    });
    
    input.value = '';
}

// إدارة الملف الشخصي
function openProfileModal() {
    document.getElementById('profileModal').classList.add('active');
    loadUserProfile();
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

async function loadUserProfile() {
    try {
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const profile = await response.json();
            
            if (profile.profile_image1) {
                document.getElementById('profileImg1').src = profile.profile_image1;
            }
            if (profile.profile_image2) {
                document.getElementById('profileImg2').src = profile.profile_image2;
            }
            
            document.getElementById('newDisplayName').value = profile.display_name;
            
            // تحميل المعلومات الشخصية
            if (profile.age) document.getElementById('userAge').value = profile.age;
            if (profile.gender) document.getElementById('userGender').value = profile.gender;
            if (profile.marital_status) document.getElementById('userMaritalStatus').value = profile.marital_status;
            if (profile.about_me) document.getElementById('userAboutMe').value = profile.about_me;
            
            const rankInfo = RANKS[profile.rank] || RANKS.visitor;
            document.getElementById('currentRank').textContent = `${rankInfo.emoji} ${rankInfo.name}`;
        }
    } catch (error) {
        console.error('خطأ في تحميل الملف الشخصي:', error);
    }
}

function previewProfileImage(imageNumber, input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(`profileImg${imageNumber}`).src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewMessageBackground(input) {
    const preview = document.getElementById('messageBackgroundPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.classList.add('has-image');
            preview.textContent = 'تم اختيار الخلفية';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadProfileImages() {
    const formData = new FormData();
    
    const file1 = document.getElementById('profileFile1').files[0];
    const file2 = document.getElementById('profileFile2').files[0];
    
    if (file1) formData.append('profile1', file1);
    if (file2) formData.append('profile2', file2);
    
    if (!file1 && !file2) {
        alert('يرجى اختيار صورة واحدة على الأقل');
        return;
    }
    
    try {
        const response = await fetch('/api/upload-profile-images', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('تم حفظ الصور بنجاح!');
            if (data.profile_image1) {
                currentUser.profile_image1 = data.profile_image1;
                document.getElementById('userAvatar').src = data.profile_image1;
            }
        } else {
            alert(data.error || 'خطأ في حفظ الصور');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

async function uploadMessageBackground() {
    const file = document.getElementById('messageBackgroundFile').files[0];
    
    if (!file) {
        alert('يرجى اختيار خلفية');
        return;
    }
    
    const formData = new FormData();
    formData.append('messageBackground', file);
    
    try {
        const response = await fetch('/api/upload-message-background', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('تم حفظ خلفية الرسائل بنجاح!');
        } else {
            alert(data.error || 'خطأ في حفظ الخلفية');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

async function updateDisplayName() {
    const newName = document.getElementById('newDisplayName').value.trim();
    
    if (!newName) {
        alert('يرجى إدخال اسم صحيح');
        return;
    }
    
    try {
        const response = await fetch('/api/user/display-name', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ display_name: newName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser.display_name = data.display_name;
            document.getElementById('userDisplayName').textContent = data.display_name;
            alert('تم تحديث الاسم بنجاح!');
        } else {
            alert(data.error || 'خطأ في تحديث الاسم');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// إدارة الغرف
function openCreateRoomModal() {
    if (currentUser.role !== 'admin') {
        alert('غير مسموح - للإداريين فقط');
        return;
    }
    document.getElementById('createRoomModal').classList.add('active');
}

function closeCreateRoomModal() {
    document.getElementById('createRoomModal').classList.remove('active');
    document.getElementById('roomName').value = '';
    document.getElementById('roomDescription').value = '';
    document.getElementById('roomBackgroundPreview').style.backgroundImage = '';
    document.getElementById('roomBackgroundPreview').classList.remove('has-image');
}

function previewRoomBackground(input) {
    const preview = document.getElementById('roomBackgroundPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.classList.add('has-image');
            preview.textContent = 'تم اختيار خلفية الغرفة';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function createRoom() {
    const name = document.getElementById('roomName').value.trim();
    const description = document.getElementById('roomDescription').value.trim();
    const backgroundFile = document.getElementById('roomBackgroundFile').files[0];
    
    if (!name) {
        alert('يرجى إدخال اسم الغرفة');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    if (backgroundFile) {
        formData.append('roomBackground', backgroundFile);
    }
    
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('تم إنشاء الغرفة بنجاح!');
            closeCreateRoomModal();
            loadRooms();
        } else {
            alert(data.error || 'خطأ في إنشاء الغرفة');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// باقي الوظائف من النسخة السابقة
async function openAdminPanel() {
    if (currentUser.role !== 'admin') {
        alert('غير مسموح - للإداريين فقط');
        return;
    }
    
    document.getElementById('adminModal').classList.add('active');
    await loadAllUsers();
    loadAvailableRanks();
}

function closeAdminPanel() {
    document.getElementById('adminModal').classList.remove('active');
}

async function loadAllUsers() {
    try {
        const response = await fetch('/api/all-users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const users = await response.json();
            const usersList = document.getElementById('allUsersList');
            usersList.innerHTML = '';
            
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'admin-user-item';
                
                const rankInfo = RANKS[user.rank] || RANKS.visitor;
                
                userItem.innerHTML = `
                    <div class="admin-user-info">
                        <img src="${user.profile_image1 || getDefaultAvatar()}" alt="صورة شخصية" class="admin-user-avatar">
                        <div class="admin-user-details">
                            <h4>${user.display_name}</h4>
                            <p>${user.email}</p>
                            <p>${rankInfo.emoji} ${rankInfo.name}</p>
                            <p>الدور: ${user.role}</p>
                        </div>
                    </div>
                    <button class="assign-rank-btn" onclick="openAssignRankModal(${user.id}, '${user.display_name}')">
                        تعيين رتبة
                    </button>
                `;
                
                usersList.appendChild(userItem);
            });
        }
    } catch (error) {
        console.error('خطأ في تحميل المستخدمين:', error);
    }
}

function loadAvailableRanks() {
    const ranksList = document.getElementById('availableRanks');
    ranksList.innerHTML = '';
    
    Object.entries(RANKS).forEach(([key, rank]) => {
        const rankItem = document.createElement('div');
        rankItem.className = 'rank-item';
        
        rankItem.innerHTML = `
            <span class="rank-emoji">${rank.emoji}</span>
            <div class="rank-name">${rank.name}</div>
            <div class="rank-level">المستوى: ${rank.level}</div>
        `;
        
        ranksList.appendChild(rankItem);
    });
}

function openAssignRankModal(userId, userName) {
    selectedUserId = userId;
    document.getElementById('targetUserName').textContent = userName;
    document.getElementById('assignRankModal').classList.add('active');
    
    const rankSelect = document.getElementById('rankSelect');
    rankSelect.innerHTML = '<option value="">اختر الرتبة</option>';
    
    Object.entries(RANKS).forEach(([key, rank]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${rank.emoji} ${rank.name}`;
        rankSelect.appendChild(option);
    });
}

function closeAssignRankModal() {
    document.getElementById('assignRankModal').classList.remove('active');
    selectedUserId = null;
}

async function confirmAssignRank() {
    const newRank = document.getElementById('rankSelect').value;
    const reason = document.getElementById('rankReason').value;
    
    if (!newRank) {
        alert('يرجى اختيار رتبة');
        return;
    }
    
    try {
        const response = await fetch('/api/assign-rank', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                userId: selectedUserId,
                newRank: newRank,
                reason: reason
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message);
            closeAssignRankModal();
            loadAllUsers();
        } else {
            alert(data.error || 'خطأ في تعيين الرتبة');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

function logout() {
    localStorage.removeItem('chatToken');
    token = null;
    currentUser = null;
    
    if (socket) {
        socket.disconnect();
    }
    
    showLoginScreen();
}

// وظائف قائمة جميع المستخدمين
async function openAllUsersModal() {
    document.getElementById('allUsersModal').classList.add('active');
    await loadAllUsersForChat();
}

function closeAllUsersModal() {
    document.getElementById('allUsersModal').classList.remove('active');
}

async function loadAllUsersForChat() {
    try {
        const response = await fetch('/api/all-users-chat', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const users = await response.json();
            displayAllUsersForChat(users);
        }
    } catch (error) {
        console.error('خطأ في تحميل المستخدمين:', error);
        document.getElementById('allUsersListModal').innerHTML = '<div class="error">خطأ في تحميل المستخدمين</div>';
    }
}

function displayAllUsersForChat(users) {
    const container = document.getElementById('allUsersListModal');
    container.innerHTML = '';
    
    if (users.length === 0) {
        container.innerHTML = '<div class="no-users">لا يوجد مستخدمين آخرين</div>';
        return;
    }
    
    users.forEach(user => {
        if (user.id === currentUser.id) return; // لا نظهر المستخدم نفسه
        
        const userDiv = document.createElement('div');
        userDiv.className = 'user-chat-item';
        
        const rankInfo = RANKS[user.rank] || RANKS.visitor;
        const statusClass = user.is_online ? 'online' : 'offline';
        const statusText = user.is_online ? 'متصل' : 'غير متصل';
        
        const adminButtons = currentUser.role === 'admin' ? `
            <button onclick="openAssignRankForUser('${user.id}', '${user.display_name}')" class="admin-btn rank-btn">
                🏆 رتبة
            </button>
            <button onclick="changeUserPassword('${user.id}', '${user.display_name}')" class="admin-btn password-btn">
                🔐 كلمة مرور
            </button>
        ` : '';
        
        userDiv.innerHTML = `
            <div class="user-info">
                <img src="${user.profile_image1 || getDefaultAvatar()}" alt="${user.display_name}" class="user-avatar">
                <div class="user-details">
                    <span class="user-name">${user.display_name}</span>
                    <span class="user-rank">${rankInfo.emoji} ${rankInfo.name}</span>
                    <span class="user-status ${statusClass}">${statusText}</span>
                    ${user.age ? `<span class="user-age">العمر: ${user.age}</span>` : ''}
                    ${user.gender ? `<span class="user-gender">${user.gender}</span>` : ''}
                    ${user.marital_status ? `<span class="user-marital">${user.marital_status}</span>` : ''}
                </div>
            </div>
            <div class="user-actions">
                <button onclick="startPrivateChatFromList('${user.id}', '${user.display_name}')" class="private-chat-btn">
                    💬 دردشة
                </button>
                <button onclick="viewUserProfile('${user.id}', '${user.display_name}')" class="view-profile-btn">
                    👤 معلومات
                </button>
                <button onclick="blockUser('${user.id}', '${user.display_name}')" class="block-btn">
                    ⛔ حظر
                </button>
                ${adminButtons}
            </div>
        `;
        
        container.appendChild(userDiv);
    });
}

function startPrivateChatFromList(userId, userName) {
    // إغلاق مودال قائمة المستخدمين
    closeAllUsersModal();
    
    // بدء الدردشة الخاصة
    currentPrivateChatUser = { userId: parseInt(userId), displayName: userName };
    document.getElementById('privateChatUserName').textContent = userName;
    document.getElementById('privateChatModal').classList.add('active');
    document.getElementById('privateChatMessages').innerHTML = '';
    loadPrivateMessages(parseInt(userId));
}

// تحديث المعلومات الشخصية
async function updatePersonalInfo() {
    const age = document.getElementById('userAge').value;
    const gender = document.getElementById('userGender').value;
    const maritalStatus = document.getElementById('userMaritalStatus').value;
    const aboutMe = document.getElementById('userAboutMe').value;
    
    try {
        const response = await fetch('/api/user/personal-info', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                age: age ? parseInt(age) : null,
                gender: gender,
                marital_status: maritalStatus,
                about_me: aboutMe
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('تم حفظ المعلومات بنجاح!');
        } else {
            alert(data.error || 'خطأ في حفظ المعلومات');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// حظر مستخدم
async function blockUser(userId, userName) {
    if (confirm(`هل أنت متأكد من حظر المستخدم ${userName}؟`)) {
        try {
            const response = await fetch('/api/block-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ blockedUserId: userId })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('تم حظر المستخدم بنجاح');
                loadAllUsersForChat(); // إعادة تحميل القائمة
            } else {
                alert(data.error || 'خطأ في حظر المستخدم');
            }
        } catch (error) {
            alert('خطأ في الاتصال');
        }
    }
}

// إلغاء حظر مستخدم
async function unblockUser(userId, userName) {
    if (confirm(`هل أنت متأكد من إلغاء حظر المستخدم ${userName}؟`)) {
        try {
            const response = await fetch(`/api/unblock-user/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('تم إلغاء حظر المستخدم بنجاح');
                loadAllUsersForChat(); // إعادة تحميل القائمة
            } else {
                alert(data.error || 'خطأ في إلغاء الحظر');
            }
        } catch (error) {
            alert('خطأ في الاتصال');
        }
    }
}

// تغيير كلمة مرور مستخدم (للإدارة)
async function changeUserPassword(userId, userName) {
    if (currentUser.role !== 'admin') {
        alert('غير مسموح - للإداريين فقط');
        return;
    }
    
    const newPassword = prompt(`أدخل كلمة المرور الجديدة لـ ${userName}:`);
    
    if (!newPassword || newPassword.length < 6) {
        alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId: userId, newPassword: newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('تم تغيير كلمة المرور بنجاح');
        } else {
            alert(data.error || 'خطأ في تغيير كلمة المرور');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// عرض معلومات مستخدم مع أزرار الإدارة
async function viewUserProfile(userId, userName) {
    try {
        const response = await fetch(`/api/user-info/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            showUserProfileModal(user);
        } else {
            alert('خطأ في تحميل معلومات المستخدم');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// وظائف الاقتباس والإشارة
function quoteMessage(messageId, author, content) {
    quotedMessage = {
        id: messageId,
        author: author,
        content: content
    };
    
    // عرض معاينة الاقتباس
    showQuotePreview();
    
    // تركيز على حقل الرسالة
    document.getElementById('messageInput').focus();
}

function showQuotePreview() {
    const messageInputArea = document.querySelector('.message-input-area');
    
    // إزالة معاينة سابقة إن وجدت
    const existingPreview = document.querySelector('.quote-preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    const quotePreview = document.createElement('div');
    quotePreview.className = 'quote-preview';
    quotePreview.innerHTML = `
        <div class="quote-preview-content">
            <div class="quote-preview-header">
                <span>📋 رد على ${quotedMessage.author}:</span>
                <button onclick="clearQuote()" class="clear-quote-btn">&times;</button>
            </div>
            <div class="quote-preview-text">${quotedMessage.content.substring(0, 100)}${quotedMessage.content.length > 100 ? '...' : ''}</div>
        </div>
    `;
    
    messageInputArea.insertBefore(quotePreview, messageInputArea.firstChild);
}

function clearQuote() {
    quotedMessage = null;
    const quotePreview = document.querySelector('.quote-preview');
    if (quotePreview) {
        quotePreview.remove();
    }
}

function mentionUser(userName) {
    const messageInput = document.getElementById('messageInput');
    const currentText = messageInput.value;
    const mention = `@${userName} `;
    
    // إضافة الإشارة في بداية الرسالة أو بعد النص الموجود
    if (currentText.trim() === '') {
        messageInput.value = mention;
    } else {
        messageInput.value = currentText + ' ' + mention;
    }
    
    messageInput.focus();
    
    // تشغيل صوت الإشارة
    playMentionSound();
}

// وظائف الأصوات
function playMessageSound() {
    if (localStorage.getItem('messageSoundsEnabled') !== 'false') {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LLdCEIKnbH8N2QQAoUXrTp66hVFApGn+DyvmAaBjmS2e4QQwAAAA==');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    }
}

function playPrivateMessageSound() {
    if (localStorage.getItem('privateSoundsEnabled') !== 'false') {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LLdCEIKnbH8N2QQAoUXrTp66hVFApGn+DyvmAaBjmS2e4AAAAA');
        audio.volume = 0.5;
        audio.play().catch(() => {});
    }
}

function playMentionSound() {
    if (localStorage.getItem('mentionSoundsEnabled') !== 'false') {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LLdCEIKnbH8N2QQAoUXrTp66hVFApGn+DyvmAaBjmS2e4BBBBB');
        audio.volume = 0.7;
        audio.play().catch(() => {});
    }
}

// عرض مودال معلومات المستخدم
function showUserProfileModal(user) {
    const rankInfo = RANKS[user.rank] || RANKS.visitor;
    const adminActions = currentUser.role === 'admin' ? `
        <button onclick="openAssignRankForUser('${user.id}', '${user.display_name}')" class="btn admin-btn">
            🏆 تغيير الرتبة
        </button>
        <button onclick="changeUserPassword('${user.id}', '${user.display_name}')" class="btn admin-btn">
            🔐 تغيير كلمة المرور
        </button>
    ` : '';
    
    const profileHtml = `
        <div class="user-profile-info">
            <div class="profile-header">
                <img src="${user.profile_image1 || getDefaultAvatar()}" alt="${user.display_name}" class="profile-large-avatar">
                <div class="profile-main-info">
                    <h3>${user.display_name}</h3>
                    <span class="profile-rank">${rankInfo.emoji} ${rankInfo.name}</span>
                    <span class="profile-status ${user.is_online ? 'online' : 'offline'}">
                        ${user.is_online ? 'متصل الآن' : 'غير متصل'}
                    </span>
                </div>
            </div>
            
            <div class="profile-details">
                ${user.age ? `<div class="profile-detail"><strong>العمر:</strong> ${user.age}</div>` : ''}
                ${user.gender ? `<div class="profile-detail"><strong>الجنس:</strong> ${user.gender}</div>` : ''}
                ${user.marital_status ? `<div class="profile-detail"><strong>الحالة الاجتماعية:</strong> ${user.marital_status}</div>` : ''}
                ${user.about_me ? `<div class="profile-detail about-me"><strong>عني:</strong><br>${user.about_me}</div>` : ''}
            </div>
            
            <div class="profile-actions">
                <button onclick="startPrivateChatFromList('${user.id}', '${user.display_name}'); closeUserProfileModal()" class="btn private-btn">
                    💬 دردشة خاصة
                </button>
                <button onclick="blockUser('${user.id}', '${user.display_name}'); closeUserProfileModal()" class="btn block-btn">
                    ⛔ حظر
                </button>
                ${adminActions}
            </div>
        </div>
    `;
    
    // عرض المعلومات في مودال مؤقت
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'userProfileViewModal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeUserProfileModal()">&times;</span>
            <h2>معلومات المستخدم</h2>
            ${profileHtml}
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeUserProfileModal() {
    const modal = document.getElementById('userProfileViewModal');
    if (modal) {
        modal.remove();
    }
}

// فتح مودال تعيين الرتبة لمستخدم معين
function openAssignRankForUser(userId, userName) {
    if (currentUser.role !== 'admin') {
        alert('غير مسموح - للإداريين فقط');
        return;
    }
    
    selectedUserId = parseInt(userId);
    document.getElementById('targetUserName').textContent = userName;
    document.getElementById('assignRankModal').classList.add('active');
    
    // إغلاق مودال معلومات المستخدم إذا كان مفتوحاً
    closeUserProfileModal();
    closeAllUsersModal();
}

function getDefaultAvatar() {
    return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='%23007bff'/><text x='20' y='25' text-anchor='middle' fill='white' font-size='16'>👤</text></svg>";
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// إغلاق المودالات عند النقر خارجها
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.remove('active');
        }
    });
}
