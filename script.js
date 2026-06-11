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

// 🚀 မော်ဒယ်များအားလုံး အောင်မြင်စွာ တက်လာစေရန် စနစ်တကျ ချိတ်ဆက်ခြင်း
async function loadFaceApiModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    try {
        console.log("Loading Face API Models...");
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log("Models Loaded Successfully.");
        isModelsLoaded = true;
        await trainFaceMatcher(); // မော်ဒယ်တက်ပြီးတာနဲ့ DB က ဝန်ထမ်း Data ကို ချက်ချင်းဆွဲယူမည်
    } catch(e) { 
        console.error("Model Boot Failure:", e); 
    }
}
loadFaceApiModels();

// 🔄 Database ထဲမှ ဝန်ထမ်းမျက်နှာ Data များအားလုံးကို ဆွဲထုတ်ပြီး မော်ဒယ်ထဲ ထည့်သွင်းခြင်း
async function trainFaceMatcher() {
    try {
        const { data: employees, error } = await supabaseClient.from('employees').select('*');
        if (error) { console.error("Database fetch error:", error); return; }
        
        const labeledDescriptors = [];
        if (!employees || employees.length === 0) {
            console.log("No registered employees found in database yet.");
            return;
        }

        employees.forEach(emp => {
            const actualEmpId = emp.emp_id || emp.employee_id || emp.id || "EMP-UNKNOWN";
            if (emp.face_data) {
                try {
                    const parsed = JSON.parse(emp.face_data);
                    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(
                        `${actualEmpId}||${emp.name}||${emp.position}`, 
                        [new Float32Array(parsed)]
                    ));
                } catch(err) {
                    console.error("Error parsing face data for employee:", emp.name);
                }
            }
        });

        if (labeledDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
            console.log("Face Matcher Trained successfully with " + labeledDescriptors.length + " profiles.");
        }
    } catch (e) { 
        console.error("Training initialization failed:", e); 
    }
}

// ==========================================
// 📸 LOGS TERMINAL CONTROLLER (Check In/Out Scan Engine)
// ==========================================
async function openScanModal() {
    // အကယ်၍ မော်ဒယ်က ဒေါင်းလုဒ်ဆွဲမပြီးသေးရင် ခေတ္တစောင့်ခိုင်းခြင်း
    if (!isModelsLoaded) {
        alert("Face Recognition models are still initializing. Please wait a few seconds...");
        return;
    }

    // နောက်ခံဆွဲရမည့် faceMatcher မရှိသေးပါက ဆွဲခိုင်းခြင်း
    if (!faceMatcher) {
        await trainFaceMatcher();
    }

    document.getElementById('scan-modal').classList.remove('hidden');
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    instruction.innerText = "Configuring environmental media feed...";

    const options = { video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: "user" } };

    try {
        activeStream = await navigator.mediaDevices.getUserMedia(options);
        video.srcObject = activeStream;
        video.onloadedmetadata = () => { 
            video.play(); 
            startEmployeeRecognitionLoop(); 
        };
    } catch (err) {
        try {
            activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = activeStream;
            video.onloadedmetadata = () => { video.play(); startEmployeeRecognitionLoop(); };
        } catch(e) {
            instruction.innerText = "❌ Stream Error. Please grant hardware permissions.";
        }
    }
}

// 🔄 Check In/Out မှာ မျက်နှာကို စက္ကန့်ပိုင်းအတွင်း ဖတ်ပေးမည့် အဓိက Loop
async function startEmployeeRecognitionLoop() {
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    
    // Modal ပိတ်သွားရင် သို့မဟုတ် ဗီဒီယိုရပ်သွားရင် Loop ကို ရပ်ပစ်မည်
    if (!video || video.paused || document.getElementById('scan-modal').classList.contains('hidden')) return;

    instruction.innerText = "Scanning... Align your face inside the circle.";
    
    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        
        if (detection) {
            if (faceMatcher) {
                const match = faceMatcher.findBestMatch(detection.descriptor);
                
                if (match && match.label !== 'unknown') {
                    const [id, name, pos] = match.label.split('||');
                    
                    // ပေါ်လာမည့်စာသားများအား သတ်မှတ်နေရာတွင် ပြောင်းလဲတပ်ဆင်ခြင်း
                    document.getElementById('recognized-id').innerText = id;
                    document.getElementById('recognized-name').innerText = name;
                    document.getElementById('recognized-pos').innerText = pos;
                    
                    closeScanModal();
                    
                    // ဝန်ထမ်းအချက်အလက်ကို ပြသပြီး သတ်မှတ်လုပ်ငန်းစဉ်အဆင့်သို့ ကူးပြောင်းခြင်း
                    document.getElementById('step-1').classList.add('hidden');
                    document.getElementById('step-2').classList.remove('hidden');
                    return; // အောင်မြင်သွားသဖြင့် Loop မှ ထွက်မည်
                } else {
                    instruction.innerText = "Searching profile... Keep looking straight.";
                }
            } else {
                instruction.innerText = "Syncing directory registry... Please wait.";
                await trainFaceMatcher();
            }
        } else {
            instruction.innerText = "No Face Detected. Position your face in front of the camera.";
        }
    } catch(e) { 
        console.error("Recognition inner execution loop exception:", e); 
    }
    
    // မျက်နှာမတွေ့မချင်း တစ်စက္ကန့်လျှင် ၂ ကြိမ်နှုန်းဖြင့် အလိုအလျောက် ထပ်ခါထပ်ခါ ဖတ်နေမည်
    setTimeout(startEmployeeRecognitionLoop, 500);
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

async function openAdminScanModal() {
    if (!isModelsLoaded) {
        alert("Face API Neural weights are loading. Try again in 3 seconds.");
        return;
    }
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

// 🛡️ Anti-Spoof စနစ် (ဓာတ်ပုံပြရင် လုံးဝကျော်မရဘဲ အပြင်လူအစစ်အမှန် လှည့်ပြမှသာ အဆင်ပြေပြေ ကျော်သွားမည့် Stable Threshold)
async function runPremiumLivenessLoop() {
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
            const noseToLeftJaw = nose.x - leftJaw.x;
            const rightJawToNose = rightJaw.x - nose.x;
            const turnRatio = noseToLeftJaw / rightJawToNose;

            if (currentLivenessStep === 1) {
                instruction.innerText = "Step 1: Look straight at the camera and stay still...";
                // မျက်နှာတည်ငြိမ်မှု စစ်ဆေးခြင်း
                if (turnRatio > 0.85 && turnRatio < 1.15) {
                    collectedDescriptors.push(detection.descriptor);
                    currentLivenessStep = 2;
                    updateStepDots();
                    await new Promise(r => setTimeout(r, 1000)); 
                }
            } 
            else if (currentLivenessStep === 2) {
                instruction.innerText = "Step 2: Turn your head CLEARLY to the Left or Right side...";
                // ဓာတ်ပုံငြိမ်ပြနေရင် ကျော်မရဘဲ မျက်နှာကို ဘေးသို့ အမှန်တကယ် လှည့်ပြမှသာ ကျော်မည့်စနစ် (0.60 အောက် သို့မဟုတ် 1.60 အထက်)
                if (turnRatio < 0.60 || turnRatio > 1.60) {
                    currentLivenessStep = 3;
                    updateStepDots();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } 
            else if (currentLivenessStep === 3) {
                instruction.innerText = "Step 3: Tilt your head CLEARLY Upwards or Downwards...";
                const noseToEyeY = nose.y - (leftEye.y + rightEye.y)/2;
                
                // အပေါ်/အောက်သို့ သိသိသာသာ မော့ပြ/ငုံ့ပြခြင်း ရှိမရှိ စစ်ဆေးခြင်း
                if (noseToEyeY < eyeDistance * 0.35 || noseToEyeY > eyeDistance * 0.65) {
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
    setTimeout(runPremiumLivenessLoop, 200); 
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