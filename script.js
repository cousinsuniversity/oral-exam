// --- FIREBASE CONFIGURATION ---
// Your specific project keys (Converted for browser usage)
const firebaseConfig = {
  apiKey: "AIzaSyDkwwG3KRH7WC9vfwtlHtXlgtwoHqHi3AU",
  authDomain: "oral-exam-97cf8.firebaseapp.com",
  projectId: "oral-exam-97cf8",
  storageBucket: "oral-exam-97cf8.firebasestorage.app",
  messagingSenderId: "987477592094",
  appId: "1:987477592094:web:5162499a2f66de303e860f",
  measurementId: "G-RC7P7Y64PD"
};

// --- INITIALIZE FIREBASE (PRIMARY APP) ---
// This instance manages the current logged-in user (Admin or Student)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- INITIALIZE SECONDARY APP (THE "GHOST" ADMIN APP) ---
// This instance is used ONLY to create new users without logging out the main Admin.
let secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryClient");
let secondaryAuth = secondaryApp.auth();

// --- STATE MANAGEMENT ---
let currentUser = null;
const subjectsByLevel = {
    'JHS': ['Mathematics', 'Science', 'English', 'Filipino'],
    'SHS': ['Core Statistics', 'Oral Communication', 'Philosophy', 'Research'],
    'College': ['Purposive Comm', 'Ethics', 'Major Subject 1', 'Major Subject 2']
};

// --- AUTHENTICATION LOGIC ---

// Handle Login (Main App)
function handleLogin() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            console.log("Logged in as:", userCredential.user.email);
        })
        .catch((error) => {
            alertCustom("Login Failed: " + error.message);
        });
}

// Handle Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
    window.location.reload();
});

// Main Auth Listener (Controls UI visibility)
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';

        // Check if Admin
        // IMPORTANT: Ensure your admin email matches one of these
        if (user.email.endsWith('@admin.edu') || user.email === 'admin@test.com') {
            document.getElementById('admin-dashboard').style.display = 'block';
            loadAdminData();
        } else {
            document.getElementById('student-dashboard').style.display = 'block';
            loadStudentData(user.uid);
        }
    } else {
        // User is logged out
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('student-dashboard').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- ADMIN FUNCTIONS ---

async function registerStudent() {
    const email = document.getElementById('new-email').value;
    const pass = document.getElementById('new-pass').value;
    const name = document.getElementById('new-name').value;
    const level = document.getElementById('new-level').value;

    if(!email || !pass || !name) {
        alertCustom("Please fill in all fields.");
        return;
    }

    try {
        // --- THE PATCH: USE SECONDARY AUTH ---
        // Create user on the secondary instance so Main Admin stays logged in
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
        const newUid = userCredential.user.uid;

        // Write data using the Primary DB (Authenticated as Admin)
        await db.collection('users').doc(newUid).set({
            name: name,
            email: email,
            level: level,
            role: 'student',
            scores: {},
            totalScore: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sign out the secondary instance immediately
        await secondaryAuth.signOut();

        alertCustom("Success! Student Registered.");
        closeModal('add-student-modal');
        
        // Clear inputs
        document.getElementById('new-email').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('new-name').value = '';

    } catch (error) {
        console.error(error);
        alertCustom("Registration Error: " + error.message);
    }
}

function loadAdminData() {
    const list = document.getElementById('admin-student-list');
    
    // Real-time listener
    db.collection('users').where('role', '==', 'student').onSnapshot((snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<tr><td colspan="4">No candidates registered yet.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name}</td>
                <td>${data.level}</td>
                <td style="color: var(--bb-gold); font-weight:bold;">${data.totalScore || 0}</td>
                <td>
                    <button class="btn" onclick="openGradingModal('${doc.id}', '${data.level}', '${data.name}')">
                        <i class="fas fa-marker"></i> Grade
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
    });
}

// Open Grading Modal
function openGradingModal(uid, level, name) {
    document.getElementById('grading-uid').value = uid;
    const container = document.getElementById('rubric-container');
    container.innerHTML = `<h3>Grading for: ${name} (${level})</h3>`;

    const subjects = subjectsByLevel[level] || subjectsByLevel['College'];
    
    // Fetch existing scores first to pre-fill inputs
    db.collection('users').doc(uid).get().then((doc) => {
        const currentScores = doc.data().scores || {};
        
        subjects.forEach(sub => {
            const val = currentScores[sub] || '';
            container.innerHTML += `
                <div class="rubric-row">
                    <label style="flex:1;">${sub}</label>
                    <input type="number" class="score-input" data-subject="${sub}" value="${val}" max="80" min="0" placeholder="0-80" style="width: 80px;">
                </div>
            `;
        });
    });

    openModal('grade-modal');
}

// Submit Grades
async function submitGrades() {
    const uid = document.getElementById('grading-uid').value;
    const inputs = document.querySelectorAll('.score-input');
    
    let scores = {};
    let total = 0;

    inputs.forEach(input => {
        const sub = input.dataset.subject;
        let val = parseInt(input.value);
        if (isNaN(val)) val = 0;
        
        // Cap at 80
        if (val > 80) val = 80;
        if (val < 0) val = 0;

        scores[sub] = val;
        total += val;
    });

    try {
        await db.collection('users').doc(uid).update({
            scores: scores,
            totalScore: total,
            gradedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeModal('grade-modal');
        alertCustom("Scores Updated Successfully");
    } catch (e) {
        alertCustom("Error saving grades: " + e.message);
    }
}


// --- STUDENT FUNCTIONS ---

function loadStudentData(uid) {
    db.collection('users').doc(uid).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('s-name').innerText = data.name;
            document.getElementById('s-level').innerText = data.level;
            document.getElementById('s-total-score').innerText = data.totalScore || 0;
            
            // Proficiency Logic
            const subjects = subjectsByLevel[data.level] || subjectsByLevel['College']; 
            const maxScore = subjects.length * 80;
            const percentage = ((data.totalScore || 0) / maxScore) * 100;
            
            document.getElementById('s-max-score').innerText = maxScore;
            
            const badge = document.getElementById('s-proficiency-badge');
            
            if (percentage >= 90) { 
                badge.innerText = "Excellent"; 
                badge.className = "badge badge-expert"; 
            } else if (percentage >= 75) { 
                badge.innerText = "Proficient"; 
                badge.className = "badge badge-avg"; 
            } else if (percentage > 0) { 
                badge.innerText = "Needs Improvement"; 
                badge.className = "badge badge-poor"; 
            } else { 
                badge.innerText = "Pending"; 
                badge.className = "badge"; 
                badge.style.backgroundColor = "#555";
            }

            // Render Table
            const tbody = document.getElementById('student-grades-body');
            tbody.innerHTML = '';
            
            if (data.scores) {
                subjects.forEach((subject) => {
                    const score = data.scores[subject] !== undefined ? data.scores[subject] : '-';
                    let feedback = 'Pending';
                    let color = '#fff';

                    if (score !== '-') {
                        if (score >= 70) { feedback = 'Satisfactory'; color = '#28a745'; }
                        else if (score >= 60) { feedback = 'Fair'; color = '#ffc107'; }
                        else { feedback = 'Review Required'; color = '#dc3545'; }
                    }

                    tbody.innerHTML += `
                        <tr>
                            <td>${subject}</td>
                            <td style="color: ${color}">${score} / 80</td>
                            <td>${feedback}</td>
                        </tr>
                    `;
                });
            }
        }
    });
}

// --- UI UTILS (MODALS) ---

function openModal(id) {
    document.getElementById(id).style.display = 'block';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function alertCustom(msg) {
    const existing = document.querySelector('.custom-alert-overlay');
    if(existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'modal-overlay custom-alert-overlay';
    div.style.display = 'block';
    div.style.zIndex = '9999'; 
    div.innerHTML = `
        <div class="modal" style="width:300px; text-align:center; border: 1px solid var(--bb-gold);">
            <h3 style="color: var(--bb-gold);">Notification</h3>
            <p>${msg}</p>
            <button class="btn btn-gold" onclick="this.parentElement.parentElement.remove()">OK</button>
        </div>
    `;
    document.body.appendChild(div);
}
