// --- FIREBASE CONFIGURATION ---
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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- INITIALIZE SECONDARY APP ---
let secondaryApp = null;
let secondaryAuth = null;

// Initialize secondary app only when needed
function initializeSecondaryApp() {
    if (!secondaryApp) {
        secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
        secondaryAuth = secondaryApp.auth();
    }
    return secondaryAuth;
}

// --- STATE MANAGEMENT ---
let currentUser = null;

// Updated subjects with 80 points each as requested
const subjectsByLevel = {
    'JHS': ['Math (algebra, geometry, calculus)', 'Science (biology, chemistry, physics)', 'English/Language (grammar, reading, vocabulary)', 'Logical/Abstract Reasoning', 'General Knowledge', 'Filipino/Social Sciences'],
    'SHS': ['Math (algebra, geometry, calculus)', 'Science (biology, chemistry, physics)', 'English/Language (grammar, reading, vocabulary)', 'Logical/Abstract Reasoning', 'General Knowledge', 'Filipino/Social Sciences'],
    'College': ['Math (algebra, geometry, calculus)', 'Science (biology, chemistry, physics)', 'English/Language (grammar, reading, vocabulary)', 'Logical/Abstract Reasoning', 'General Knowledge', 'Filipino/Social Sciences']
};

// Calculate proficiency rating based on score
function calculateProficiencyRating(score, maxScore) {
    const percentage = (score / maxScore) * 100;
    
    if (percentage >= 90) return { rating: "1.0", status: "proficient" };
    if (percentage >= 80) return { rating: "2.0", status: "proficient" };
    if (percentage >= 75) return { rating: "3.0", status: "proficient" };
    if (percentage >= 70) return { rating: "4.0", status: "proficient" };
    return { rating: "0.0", status: "not proficient" };
}

// --- AUTHENTICATION LOGIC ---

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
        })
        .catch((error) => {
            alertCustom("Login Failed: " + error.message);
        });
}

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
    window.location.reload();
});

// Main Auth Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';

        // Check if Admin
        if (user.email.endsWith('@admin.edu') || user.email === 'admin@test.com' || user.email.includes('admin')) {
            document.getElementById('admin-dashboard').style.display = 'block';
            loadAdminData();
        } else {
            document.getElementById('student-dashboard').style.display = 'block';
            loadStudentData(user.uid);
        }
    } else {
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
        // Initialize secondary app
        const secondaryAuth = initializeSecondaryApp();
        
        // Create user in secondary Auth
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
        const newUid = userCredential.user.uid;

        // Initialize scores object for all subjects
        const subjects = subjectsByLevel[level];
        const initialScores = {};
        subjects.forEach(subject => {
            initialScores[subject] = 0; // Initialize with 0 instead of empty
        });

        // Write Profile to Firestore
        await db.collection('users').doc(newUid).set({
            name: name,
            email: email,
            level: level,
            role: 'student',
            scores: initialScores, 
            totalScore: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sign out ghost session
        await secondaryAuth.signOut();

        alertCustom("Success! Student Registered.");
        closeModal('add-student-modal');
        
        // Clear inputs
        document.getElementById('new-email').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('new-name').value = '';

    } catch (error) {
        console.error("Registration Error:", error);
        alertCustom("Registration Error: " + error.message);
    }
}

function loadAdminData() {
    const list = document.getElementById('admin-student-list');
    
    // Initial loading message
    list.innerHTML = '<tr><td colspan="4">Loading candidates...</td></tr>';
    
    // Real-time listener
    db.collection('users').where('role', '==', 'student')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        list.innerHTML = '';
        
        if (snapshot.empty) {
            list.innerHTML = '<tr><td colspan="4">No candidates registered yet.</td></tr>';
            return;
        }

        let hasData = false;
        snapshot.forEach(doc => {
            hasData = true;
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.name || 'N/A'}</td>
                <td>${data.level || 'Not Set'}</td>
                <td style="color: var(--bb-gold); font-weight:bold;">${data.totalScore || 0} / ${(subjectsByLevel[data.level] || subjectsByLevel['College']).length * 80}</td>
                <td>
                    <button class="btn" onclick="openGradingModal('${doc.id}', '${data.level}', '${data.name}')">
                        <i class="fas fa-marker"></i> Grade
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
        
        if (!hasData) {
            list.innerHTML = '<tr><td colspan="4">No candidates registered yet.</td></tr>';
        }
    }, (error) => {
        console.error("Error loading admin data:", error);
        list.innerHTML = '<tr><td colspan="4">Error loading data. Please refresh.</td></tr>';
    });
}

function openGradingModal(uid, level, name) {
    document.getElementById('grading-uid').value = uid;
    const container = document.getElementById('rubric-container');
    
    // Clear and set up modal
    container.innerHTML = `
        <h3>Evaluate: ${name} (${level})</h3>
        <p style="color: #888; margin-bottom: 20px;">Score each subject out of 80 points</p>
    `;

    // Get subjects for this level
    const subjects = subjectsByLevel[level] || subjectsByLevel['College'];
    
    // Load existing scores
    db.collection('users').doc(uid).get().then((doc) => {
        const data = doc.data();
        const currentScores = data.scores || {};
        
        subjects.forEach(subject => {
            const currentScore = currentScores[subject] !== undefined ? currentScores[subject] : '';
            const proficiency = calculateProficiencyRating(currentScore || 0, 80);
            
            container.innerHTML += `
                <div class="rubric-row" style="margin-bottom: 15px; padding: 15px; background: #222;">
                    <div style="flex: 1;">
                        <strong>${subject}</strong>
                        <div style="font-size: 0.9em; color: #aaa; margin-top: 5px;">
                            Current: ${currentScore || 0}/80 • Rating: ${proficiency.rating}
                        </div>
                    </div>
                    <input type="number" 
                           class="score-input" 
                           data-subject="${subject}" 
                           value="${currentScore}" 
                           max="80" 
                           min="0" 
                           placeholder="0-80" 
                           style="width: 100px; padding: 8px; background: #111; color: white; border: 1px solid var(--bb-border); border-radius: 4px;">
                </div>
            `;
        });
    });

    openModal('grade-modal');
}

async function submitGrades() {
    const uid = document.getElementById('grading-uid').value;
    const inputs = document.querySelectorAll('.score-input');
    
    let scores = {};
    let total = 0;

    inputs.forEach(input => {
        const sub = input.dataset.subject;
        let val = parseInt(input.value);
        if (isNaN(val)) val = 0;
        
        // Enforce 0-80 range
        val = Math.max(0, Math.min(80, val));
        
        scores[sub] = val;
        total += val;
    });

    try {
        await db.collection('users').doc(uid).update({
            scores: scores,
            totalScore: total,
            gradedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastGradedBy: currentUser.email
        });

        closeModal('grade-modal');
        alertCustom("Evaluation submitted successfully!");
    } catch (e) {
        console.error("Error saving grades:", e);
        alertCustom("Error saving grades: " + e.message);
    }
}

// --- STUDENT FUNCTIONS ---

function loadStudentData(uid) {
    const nameElement = document.getElementById('s-name');
    const levelElement = document.getElementById('s-level');
    const totalScoreElement = document.getElementById('s-total-score');
    const maxScoreElement = document.getElementById('s-max-score');
    const statusElement = document.getElementById('s-status');
    const badgeElement = document.getElementById('s-proficiency-badge');
    
    // Set loading states
    nameElement.innerText = "Loading...";
    levelElement.innerText = "Loading...";
    totalScoreElement.innerText = "0";
    
    db.collection('users').doc(uid).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // 1. Populate Profile Info
            nameElement.innerText = data.name || "Name Not Set";
            levelElement.innerText = data.level || "Level Not Set";
            
            // Ensure scores object exists
            const scores = data.scores || {};
            const level = data.level || 'College';
            const subjects = subjectsByLevel[level] || subjectsByLevel['College'];
            
            // Calculate total score
            let totalScore = 0;
            subjects.forEach(subject => {
                totalScore += parseInt(scores[subject]) || 0;
            });
            
            totalScoreElement.innerText = totalScore;
            const maxScore = subjects.length * 80;
            maxScoreElement.innerText = maxScore;
            
            // Set status
            statusElement.innerText = data.gradedAt ? "Evaluated" : "Pending Evaluation";
            
            // 2. Proficiency Badge Logic
            const percentage = (totalScore / maxScore) * 100;
            const proficiency = calculateProficiencyRating(totalScore, maxScore);
            
            badgeElement.innerText = proficiency.status;
            if (proficiency.status === "proficient") {
                badgeElement.className = "badge badge-expert";
            } else {
                badgeElement.className = "badge badge-poor";
            }
            
            // 3. Subject Breakdown
            const tbody = document.getElementById('student-grades-body');
            tbody.innerHTML = '';
            
            subjects.forEach((subject) => {
                const score = scores[subject] || 0;
                const subjectProficiency = calculateProficiencyRating(score, 80);
                
                tbody.innerHTML += `
                    <tr>
                        <td>${subject}</td>
                        <td>
                            <div>Score: ${score}/80</div>
                            <div>Rating: ${subjectProficiency.rating}</div>
                            <div style="color: ${subjectProficiency.status === 'proficient' ? '#28a745' : '#dc3545'}; font-weight: bold;">
                                ${subjectProficiency.status}
                            </div>
                        </td>
                    </tr>
                `;
            });

        } else {
            console.log("No student document found!");
            nameElement.innerText = "Record Not Found - Please contact administrator";
            levelElement.innerText = "N/A";
            badgeElement.innerText = "ERROR";
            badgeElement.className = "badge";
            badgeElement.style.backgroundColor = "#dc3545";
        }
    }, (error) => {
        console.error("Error fetching student data:", error);
        nameElement.innerText = "Error Loading Data";
        levelElement.innerText = "Error";
        alertCustom("Error loading your data. Please try refreshing.");
    });
}

// --- UI UTILS ---

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

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Add Enter key support for login
document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleLogin();
    }
});
