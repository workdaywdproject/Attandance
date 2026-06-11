// ==========================================
// 🌐 SUPABASE CLOUD SYNC CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let faceMatcher = null;
let activeStream = null;
let currentLivenessStep = 1; 
let collectedDescriptors = [];
let isModelsLoaded = false;

// Load Neural Network Weights
async function loadFaceApiModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        isModelsLoaded = true;
        await trainFaceMatcher();
    } catch(e) { 
        console.error("Model Boot Failure:", e); 
    }
}
loadFaceApiModels();

// Dynamic Compilation of Employee Rosters
async function trainFaceMatcher() {
    try {
        const { data: employees } = await supabaseClient.from('employees').select('*');
        const labeledDescriptors = [];
        if (!employees) return;

        employees.forEach(emp => {
            const actualEmpId = emp.emp_id || emp.employee_id || emp.id || "EMP-UNKNOWN";
            if (emp.face_data) {
                const parsed = JSON.parse(emp.face_data);
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(
                    `${actualEmpId}||${emp.name}||${emp.position}`, 
                    [new Float32Array(parsed)]
                ));
            }
        });
        if (labeledDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
        }
    } catch (e) { console.error(e); }
}

// ==========================================
// 📸 PORTAL TERMINAL LOGIC (portal.html)
// ==========================================
async function openScanModal() {
    if (!isModelsLoaded) {
        alert("Face Recognition models are still initializing. Please wait...");
        return;
    }
    document.getElementById('scan-modal').classList.remove('hidden');
    const video = document.getElementById('video');
    currentLivenessStep = 1;
    updatePortalStepDots();

    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640, facingMode: "user" } });
        video.srcObject = activeStream;
        video.onloadedmetadata = () => { video.play(); runPortalLivenessLoop(); };
    } catch (err) {
        document.getElementById('instruction').innerText = "❌ Camera connection failed.";
    }
}

function updatePortalStepDots() {
    document.querySelectorAll('.portal-step-dot').forEach(dot => dot.classList.remove('active'));
    const currentDot = document.getElementById(`portal-dot-step${currentLivenessStep}`);
    if(currentDot) currentDot.classList.add('active');
}

// Portal Liveness Anti-Spoof Tracking Engine
async function runPortalLivenessLoop() {
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    if (!video || video.paused || document.getElementById('scan-modal').classList.contains('hidden')) return;

    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
            const landmarks = detection.landmarks;
            const nose = landmarks.getNose()[0];
            const leftEye = landmarks.getLeftEye()[0];
            const rightEye = landmarks.getRightEye()[0];
            const jaw = landmarks.getJawOutline();
            const leftJaw = jaw[0];
            const rightJaw = jaw[16];

            const eyeDistance = rightEye.x - leftEye.x;
            const turnRatio = (nose.x - leftJaw.x) / (rightJaw.x - nose.x);

            if (currentLivenessStep === 1) {
                instruction.innerText = "Step 1: Look straight at the camera and stay still...";
                if (turnRatio > 0.85 && turnRatio < 1.15) {
                    if (faceMatcher) {
                        const match = faceMatcher.findBestMatch(detection.descriptor);
                        if (match && match.label !== 'unknown') {
                            const [id, name, pos] = match.label.split('||');
                            document.getElementById('recognized-id').innerText = id;
                            document.getElementById('recognized-name').innerText = name;
                            document.getElementById('recognized-pos').innerText = pos;
                            
                            currentLivenessStep = 2;
                            updatePortalStepDots();
                            await new Promise(r => setTimeout(r, 1000));
                        } else {
                            instruction.innerText = "Unknown Profile. Please look directly at the camera.";
                        }
                    } else {
                        instruction.innerText = "Syncing system data... Please wait.";
                        await trainFaceMatcher();
                    }
                }
            } 
            else if (currentLivenessStep === 2) {
                instruction.innerText = "Step 2: Turn your head CLEARLY to the Left or Right side...";
                if (turnRatio < 0.60 || turnRatio > 1.60) {
                    currentLivenessStep = 3;
                    updatePortalStepDots();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } 
            else if (currentLivenessStep === 3) {
                instruction.innerText = "Step 3: Tilt your head CLEARLY Upwards or Downwards...";
                const noseToEyeY = nose.y - (leftEye.y + rightEye.y)/2;
                
                if (noseToEyeY < eyeDistance * 0.35 || noseToEyeY > eyeDistance * 0.65) {
                    instruction.innerText = "🎉 Verification Successful!";
                    setTimeout(() => {
                        closeScanModal();
                        document.getElementById('step-1').classList.add('hidden');
                        document.getElementById('step-2').classList.remove('hidden');
                    }, 1200);
                    return;
                }
            }
        } else {
            instruction.innerText = "No Face Detected. Position your face in the center.";
        }
    } catch (e) { console.error(e); }
    setTimeout(runPortalLivenessLoop, 200); 
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.add('hidden');
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

function showConfirmModal() {
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value.trim();
    
    document.getElementById('conf-name').innerText = document.getElementById('recognized-name').innerText;
    document.getElementById('conf-type').innerText = type === "IN" ? "Check-In (Arrival)" : "Check-Out (Departure)";
    document.getElementById('conf-remark').innerText = remark ? remark : "None";
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }

async function submitAttendance() {
    closeConfirmModal();
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value.trim();

    const payload = {
        emp_id: document.getElementById('recognized-id').innerText,
        name: document.getElementById('recognized-name').innerText,
        position: document.getElementById('recognized-pos').innerText,
        type: type,
        remark: remark,
        timestamp: new Date().toISOString()
    };

    try {
        await supabaseClient.from('attendance').insert([payload]);
        const status = document.getElementById('status-modal');
        document.getElementById('status-title').innerText = "Process Success";
        document.getElementById('status-message').innerText = "Attendance log registered successfully.";
        status.classList.remove('hidden');
        setTimeout(() => { location.reload(); }, 2500);
    } catch(e) { alert("Error writing entry to log table."); }
}

// ==========================================
// 👑 ADMIN REGISTER LOGIC (admin.html)
// ==========================================
async function loadEmployeeTable() {
    const tbody = document.getElementById('employee-table-body');
    if (!tbody) return;
    tbody.innerHTML = "";

    const { data: employees } = await supabaseClient.from('employees').select('*');
    if (!employees || employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No records found.</td></tr>`;
        return;
    }

    employees.forEach(emp => {
        const displayId = emp.emp_id || emp.employee_id || emp.id || "N/A";
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${displayId}</b></td>
            <td>${emp.name}</td>
            <td>${emp.position}</td>
            <td><button onclick="deleteEmployee('${emp.id}')" class="btn-red" style="width:auto; padding:6px 12px; font-size:0.8rem;">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteEmployee(id) {
    if (confirm("Are you sure you want to remove this employee account?")) {
        await supabaseClient.from('employees').delete().eq('id', id);
        loadEmployeeTable();
        trainFaceMatcher();
    }
}

async function openAdminScanModal() {
    if (!isModelsLoaded) {
        alert("Face API Neural weights are loading. Try again in a moment.");
        return;
    }
    document.getElementById('admin-scan-modal').classList.remove('hidden');
    const video = document.getElementById('admin-video');
    currentLivenessStep = 1;
    collectedDescriptors = [];
    updateAdminStepDots();

    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640, facingMode: "user" } });
        video.srcObject = activeStream;
        video.onloadedmetadata = () => { video.play(); runAdminLivenessLoop(); };
    } catch(err) {
        document.getElementById('admin-instruction').innerText = "❌ Device camera stream failed.";
    }
}

function updateAdminStepDots() {
    document.querySelectorAll('.admin-step-dot').forEach(dot => dot.classList.remove('active'));
    const currentDot = document.getElementById(`admin-dot-step${currentLivenessStep}`);
    if(currentDot) currentDot.classList.add('active');
}

async function runAdminLivenessLoop() {
    const video = document.getElementById('admin-video');
    const instruction = document.getElementById('admin-instruction');
    if (!video || video.paused || document.getElementById('admin-scan-modal').classList.contains('hidden')) return;

    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
            const landmarks = detection.landmarks;
            const nose = landmarks.getNose()[0];
            const leftEye = landmarks.getLeftEye()[0];
            const rightEye = landmarks.getRightEye()[0];
            const jaw = landmarks.getJawOutline();
            const leftJaw = jaw[0];
            const rightJaw = jaw[16];

            const eyeDistance = rightEye.x - leftEye.x;
            const turnRatio = (nose.x - leftJaw.x) / (rightJaw.x - nose.x);

            if (currentLivenessStep === 1) {
                instruction.innerText = "Step 1: Look straight at the camera and stay still...";
                if (turnRatio > 0.85 && turnRatio < 1.15) {
                    collectedDescriptors.push(detection.descriptor);
                    currentLivenessStep = 2;
                    updateAdminStepDots();
                    await new Promise(r => setTimeout(r, 1000)); 
                }
            } 
            else if (currentLivenessStep === 2) {
                instruction.innerText = "Step 2: Turn your head CLEARLY to the Left or Right side...";
                if (turnRatio < 0.60 || turnRatio > 1.60) {
                    currentLivenessStep = 3;
                    updateAdminStepDots();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } 
            else if (currentLivenessStep === 3) {
                instruction.innerText = "Step 3: Tilt your head CLEARLY Upwards or Downwards...";
                const noseToEyeY = nose.y - (leftEye.y + rightEye.y)/2;
                
                if (noseToEyeY < eyeDistance * 0.35 || noseToEyeY > eyeDistance * 0.65) {
                    instruction.innerText = "🎉 Biometrics Enrolled Successfully!";
                    
                    const finalDescriptor = collectedDescriptors[0] || detection.descriptor;
                    document.getElementById('admin-face-data').value = JSON.stringify(Array.from(finalDescriptor));
                    document.getElementById('face-status').innerText = "✅ Biometrics Enrolled Successfully";
                    document.getElementById('face-status').style.color = "var(--success)";
                    
                    setTimeout(closeAdminScanModal, 1500);
                    return;
                }
            }
        } else {
            instruction.innerText = "No Face Detected. Position your face in the center.";
        }
    } catch (e) { console.error(e); }
    setTimeout(runAdminLivenessLoop, 200); 
}

function closeAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.add('hidden');
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
}

async function saveEmployee() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const pos = document.getElementById('admin-emp-pos').value.trim();
    const faceData = document.getElementById('admin-face-data').value;

    if (!empId || !name || !pos || !faceData) { alert("Please complete all input parameters and biometric steps."); return; }

    const payload = { emp_id: empId, name: name, position: pos, face_data: faceData };

    try {
        await supabaseClient.from('employees').insert([payload]);
        alert("Employee account written to directory successfully.");
        resetAdminForm();
        loadEmployeeTable();
        trainFaceMatcher();
    } catch(e) { alert("Error communicating payload with server."); }
}

function resetAdminForm() {
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-emp-pos').value = "";
    document.getElementById('admin-face-data').value = "";
    document.getElementById('face-status').innerText = "No biometric credentials enrolled yet.";
    document.getElementById('face-status').style.color = "var(--danger)";
}

function initDashboard() {
    loadEmployeeTable();
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
        events: async function(info, successCallback, failureCallback) {
            const { data } = await supabaseClient.from('attendance').select('timestamp');
            const counts = {};
            if(data) {
                data.forEach(log => {
                    const d = log.timestamp.split('T')[0];
                    counts[d] = (counts[d] || 0) + 1;
                });
            }
            const events = Object.keys(counts).map(k => ({ title: `Logs: ${counts[k]}`, start: k }));
            successCallback(events);
        }
    });
    calendar.render();
}