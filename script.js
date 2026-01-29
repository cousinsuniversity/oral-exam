// --- FIREBASE CONFIGURATION ---
// TODO: Replace with your actual Firebase project config keys
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
// Used ONLY to create new users without logging out the main Admin.
let secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryClient");
let secondaryAuth = secondaryApp.auth();

// --- STATE MANAGEMENT ---
let currentUser = null;

// Ensure these keys match the HTML select values exactly
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

    if (!email || !pass) {
        alertCustom("Please enter both email and password.");
        return;
    }

    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            console.log("Logged in as:", userCredential.user.email);
            // UI updates automatically via onAuthStateChanged
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
        // 1. Create user in 'Ghost' Auth
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
        const newUid = userCredential.user.uid;

        // 2. Write Profile to Firestore (Using Admin's permission)
        // We force 'scores' to be an empty object to prevent undefined errors later
        await db.collection('users').doc(newUid).set({
            name: name,
            email: email,
            level: level,
            role: 'student',
            scores: {}, 
            totalScore: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Sign out ghost session
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
    }, (error) => {
        console.error("Error loading admin data:", error);
        list.innerHTML = '<tr><td colspan="4">Error loading data. Check console.</td></tr>';
    });
}

// Open Grading Modal
function openGradingModal(uid, level, name) {
    document.getElementById('grading-uid').value = uid;
    const container = document.getElementById('rubric-container');
    container.innerHTML = `<h3>Grading for: ${name} (${level})</h3>`;

    // Fallback to College if level is somehow mismatched
    const subjects = subjectsByLevel[level] || subjectsByLevel['College'];
    
    db.collection('users').doc(uid).get().then((doc) => {
        const currentScores = doc.data().scores || {};
        
        subjects.forEach(sub => {
            const val = currentScores[sub] !== undefined ? currentScores[sub] : '';
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

// --- STUDENT FUNCTIONS (FIXED) ---

function loadStudentData(uid) {
    db.collection('users').doc(uid).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // 1. Populate Profile Info
            document.getElementById('s-name').innerText = data.name || "N/A";
            document.getElementById('s-level').innerText = data.level || "N/A";
            document.getElementById('s-total-score').innerText = data.totalScore || 0;
            document.getElementById('s-status').innerText = "Active";

            // 2. Proficiency Badge Logic
            // Ensure we have a valid subject list. If data.level doesn't match keys, default to College.
            const subjects = subjectsByLevel[data.level] || subjectsByLevel['College']; 
            const maxScore = subjects.length * 80;
            const currentTotal = data.totalScore || 0;
            
            document.getElementById('s-max-score').innerText = maxScore;
            
            const badge = document.getElementById('s-proficiency-badge');
            
            // Calculate proficiency percentage
            const percentage = (currentTotal / maxScore) * 100;

            if (percentage >= 75) { 
                badge.innerText = "PROFICIENT"; 
                badge.className = "badge badge-expert"; 
            } else if (currentTotal > 0) { 
                badge.innerText = "NOT PROFICIENT"; 
                badge.className = "badge badge-poor"; 
            } else { 
                badge.innerText = "PENDING"; 
                badge.className = "badge"; 
                badge.style.backgroundColor = "#555";
            }

            // 3. Subject Breakdown (FIXED: Shows only Proficiency Text)
            const tableHead = document.querySelector('#student-grades-table thead tr');
            // Update Headers to match request
            tableHead.innerHTML = `<th>Subject</th><th>Proficiency Rating</th>`;

            const tbody = document.getElementById('student-grades-body');
            tbody.innerHTML = '';
            
            const studentScores = data.scores || {};

            subjects.forEach((subject) => {
                const score = studentScores[subject];
                let statusText = "WAITING";
                let statusColor = "#888"; // Grey for waiting

                // Logic: Passing is usually 60/80 (75%)
                if (score !== undefined && score !== null && score !== "") {
                    if (score >= 60) {
                        statusText = "PROFICIENT";
                        statusColor = "#28a745"; // Green
                    } else {
                        statusText = "NOT PROFICIENT";
                        statusColor = "#dc3545"; // Red
                    }
                }

                tbody.innerHTML += `
                    <tr>
                        <td>${subject}</td>
                        <td style="color: ${statusColor}; font-weight: bold;">
                            ${statusText}
                        </td>
                    </tr>
                `;
            });

        } else {
            console.log("No student document found!");
            document.getElementById('s-name').innerText = "Record Not Found";
        }
    }, (error) => {
        console.error("Error fetching student data:", error);
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
