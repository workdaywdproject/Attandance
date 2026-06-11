// ==========================================
// 🌐 SUPABASE CLOUD SYNC CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let faceMatcher = null;
let activeStream = null;
let currentLivenessStep = 1; // 1: Center, 2: Left/Right, 3: Up/Down
let collectedDescriptors = [];

// Fetch Neural Weights and Active Data Models
async function loadFaceApiModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        await trainFaceMatcher();
    } catch(e) { console.error("Model Boot Failure:", e); }
}
loadFaceApiModels();

// Dynamic Compilation to prevent 'undefined' values across datasets
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
// 📸 LOGS TERMINAL CONTROLLER (index.html)
// ==========================================
async function openScanModal() {
    document.getElementById('scan-modal').classList.remove('hidden');
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    instruction.innerText = "Configuring environmental media feed...";

    const options = { video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: "user" } };

    try {
        activeStream = await navigator.mediaDevices.getUserMedia(options);
        video.srcObject = activeStream;
        video.onloadedmetadata = () => { video.play(); startEmployeeRecognitionLoop(); };
    } catch (err) {
        try {
            activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = activeStream;
            video.onloadedmetadata = () => { video.play(); startEmployeeRecognitionLoop(); };
        } catch(e) {
            instruction.innerText = "❌ Stream Error. Please grand hardware permissions.";
        }
    }
}

async function startEmployeeRecognitionLoop() {
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    if (!video || video.paused) return;

    instruction.innerText = "Align your face inside the circle tracker...";
    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        if (detection && faceMatcher) {
            const match = faceMatcher.findBestMatch(detection.descriptor);
            if (match && match.label !== 'unknown') {
                const [id, name, pos] = match.label.split('||');
                document.getElementById('recognized-id').innerText = id;
                document.getElementById('recognized-name').innerText = name;
                document.getElementById('recognized-pos').innerText = pos;
                
                closeScanModal();
                document.getElementById('step-1').classList.add('hidden');
                document.getElementById('step-2').classList.remove('hidden');
                return;
            }
        }
    } catch(e) { console.error(e); }
    setTimeout(startEmployeeRecognitionLoop, 400);
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.add('hidden');
    if (activeStream) activeStream.getTracks().forEach(track => track.stop());
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
// 👑 DASHBOARD LOGIC GRID (admin.html)
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

// 📸 REGISTRATION LIVENESS TRIGGER
async function openAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.remove('hidden');
    const video = document.getElementById('admin-video');
    currentLivenessStep = 1;
    collectedDescriptors = [];
    updateStepDots();

    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640, facingMode: "user" } });
        video.srcObject = activeStream;
        video.onloadedmetadata = () => { video.play(); runPremiumLivenessLoop(); };
    } catch(err) {
        document.getElementById('admin-instruction').innerText = "❌ Device media stream failed.";
    }
}

function updateStepDots() {
    document.querySelectorAll('.step-dot').forEach(dot => dot.classList.remove('active'));
    const currentDot = document.getElementById(`dot-step${currentLivenessStep}`);
    if(currentDot) currentDot.classList.add('active');
}

// 🧠 Anti-Spoof Dynamic Liveness Loop (Balanced Pace)
async function runPremiumLivenessLoop() {
    const video = document.getElementById('admin-video');
    const instruction = document.getElementById('admin-instruction');
    if (!video || video.paused) return;

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
            const noseToLeftJaw = nose.x - leftJaw.x;
            const rightJawToNose = rightJaw.x - nose.x;
            const turnRatio = noseToLeftJaw / rightJawToNose;

            if (currentLivenessStep === 1) {
                instruction.innerText = "Step 1: Look directly at the camera and stay still...";
                if (turnRatio > 0.85 && turnRatio < 1.15) {
                    collectedDescriptors.push(detection.descriptor);
                    currentLivenessStep = 2;
                    updateStepDots();
                    await new Promise(r => setTimeout(r, 1000)); // 1s buffer for balanced pacing
                }
            } 
            else if (currentLivenessStep === 2) {
                instruction.innerText = "Step 2: Turn your head slightly Left or Right...";
                if (turnRatio < 0.65 || turnRatio > 1.45) {
                    currentLivenessStep = 3;
                    updateStepDots();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } 
            else if (currentLivenessStep === 3) {
                instruction.innerText = "Step 3: Tilt your head slightly Up or Down...";
                const noseToEyeY = nose.y - (leftEye.y + rightEye.y)/2;
                
                if (noseToEyeY < eyeDistance * 0.38 || noseToEyeY > eyeDistance * 0.62) {
                    instruction.innerText = "🎉 All 3 liveness steps verified successfully!";
                    
                    const finalDescriptor = collectedDescriptors[0] || detection.descriptor;
                    document.getElementById('admin-face-data').value = JSON.stringify(Array.from(finalDescriptor));
                    document.getElementById('face-status').innerText = "✅ Biometrics Enrolled Successfully";
                    document.getElementById('face-status').style.color = "var(--success)";
                    
                    setTimeout(closeAdminScanModal, 1500);
                    return;
                }
            }
        }
    } catch (e) { console.error(e); }
    setTimeout(runPremiumLivenessLoop, 150); 
}

function closeAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.add('hidden');
    if (activeStream) activeStream.getTracks().forEach(track => track.stop());
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
    } catch(e) { alert("Error communication payload with server."); }
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