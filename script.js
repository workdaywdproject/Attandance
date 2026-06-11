const SUPABASE_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let faceMatcher = null;
let activeStream = null;
let currentLivenessStep = 1; // 1: တည့်တည့်, 2: ဘယ်/ညာ, 3: အပေါ်/အောက်
let collectedDescriptors = [];
let motionTimer = null;

async function loadFaceApiModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    trainFaceMatcher();
}
loadFaceApiModels();

async function trainFaceMatcher() {
    try {
        const { data: employees } = await supabaseClient.from('employees').select('*');
        const labeledDescriptors = [];
        if (!employees) return;

        employees.forEach(emp => {
            // 🛠 ဤနေရာတွင် ID field များကို စနစ်တကျရှာဖွေပြီး undefined ဖြစ်ခြင်းမှ ကာကွယ်ထားပါသည်
            const actualEmpId = emp.emp_id || emp.employee_id || emp.id;
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

// ဝန်ထမ်းစာရင်းဇယားပြသခြင်း (ID undefined ပြဿနာကို ရှင်းလင်းပြီး)
async function loadEmployeeTable() {
    const tbody = document.getElementById('employee-table-body');
    if (!tbody) return;
    const { data: employees } = await supabaseClient.from('employees').select('*');
    tbody.innerHTML = "";
    
    if(employees) {
        employees.forEach(emp => {
            // 🛠 ဇယားထဲမှာ undefined လုံးဝမပြအောင် စစ်ဆေးထုတ်ယူခြင်း
            const displayId = emp.emp_id || emp.employee_id || emp.id || "N/A";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${displayId}</b></td>
                <td>${emp.name}</td>
                <td>${emp.position}</td>
                <td><button onclick="deleteEmployee('${emp.id}')" class="btn-red" style="width:auto; padding:6px 12px;">ပယ်ဖျက်</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

async function deleteEmployee(id) {
    if(confirm("ဤဝန်ထမ်းကို ဖျက်ရန် သေချာပါသလား?")) {
        await supabaseClient.from('employees').delete().eq('id', id);
        loadEmployeeTable();
        trainFaceMatcher();
    }
}

function initDashboard() {
    loadEmployeeTable();
}

// 📸 PREMIUM CAMERA & LIVENESS CONTROLLER
async function openAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.remove('hidden');
    const video = document.getElementById('admin-video');
    currentLivenessStep = 1;
    collectedDescriptors = [];
    updateStepDots();

    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 640, facingMode: "user" } 
        });
        video.srcObject = activeStream;
        video.onloadedmetadata = () => {
            video.play();
            runPremiumLivenessLoop();
        };
    } catch (err) {
        document.getElementById('admin-instruction').innerText = "❌ ကင်မရာဖွင့်၍မရပါ";
    }
}

function updateStepDots() {
    document.querySelectorAll('.step-dot').forEach(dot => dot.classList.remove('active'));
    const currentDot = document.getElementById(`dot-step${currentLivenessStep}`);
    if(currentDot) currentDot.classList.add('active');
}

// 🧠 မျက်နှာလှုပ်ရှားမှုအဆင့်ဆင့်ကို သိပ်မကြာ အရမ်းမမြန်အောင် စစ်ဆေးပေးသည့် Logic
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

            // မျက်နှာလှည့်သည့်အချိုးများကို တွက်ချက်ခြင်း
            const eyeDistance = rightEye.x - leftEye.x;
            const noseToLeftJaw = nose.x - leftJaw.x;
            const rightJawToNose = rightJaw.x - nose.x;
            const turnRatio = noseToLeftJaw / rightJawToNose;

            if (currentLivenessStep === 1) {
                instruction.innerText = "📸 အဆင့် (၁) - ကင်မရာကို တည့်တည့်ကြည့်ပေးပါ...";
                if (turnRatio > 0.8 && turnRatio < 1.2) { // မျက်နှာတည့်နေချိန်
                    collectedDescriptors.push(detection.descriptor);
                    currentLivenessStep = 2;
                    updateStepDots();
                    await delay(1200); // သိပ်မမြန်အောင် စက္ကန့်အနည်းငယ်ဆိုင်းခြင်း
                }
            } 
            else if (currentLivenessStep === 2) {
                instruction.innerText = "ထူးခြားမှုစစ်ဆေးရန် - ခေါင်းကို ဘယ် သို့မဟုတ် ညာ သို့ အနည်းငယ်လှည့်ပါ...";
                if (turnRatio < 0.6 || turnRatio > 1.5) { // ဘယ် သို့မဟုတ် ညာ လှည့်သွားချိန်
                    currentLivenessStep = 3;
                    updateStepDots();
                    await delay(1200);
                }
            } 
            else if (currentLivenessStep === 3) {
                instruction.innerText = "နောက်ဆုံးအဆင့် - ခေါင်းကို အပေါ် သို့မဟုတ် အောက် သို့ အနည်းငယ်လှုပ်ရှားပါ...";
                const noseToEyeY = nose.y - (leftEye.y + rightEye.y)/2;
                
                if (noseToEyeY < eyeDistance * 0.35 || noseToEyeY > eyeDistance * 0.65) { // အပေါ်/အောက် လှုပ်ရှားသွားချိန်
                    instruction.innerText = "🎉 မှတ်တမ်းရယူခြင်း အောင်မြင်ပါသည်။";
                    
                    // ပျမ်းမျှမျက်နှာ Descriptor ကို ရယူခြင်း
                    const finalDescriptor = collectedDescriptors[0] || detection.descriptor;
                    document.getElementById('admin-face-data').value = JSON.stringify(Array.from(finalDescriptor));
                    document.getElementById('face-status').innerText = "✅ ဇီဝအချက်အလက် အဆင်သင့်ရှိပါသည်";
                    document.getElementById('face-status').style.color = "var(--success)";
                    
                    setTimeout(closeAdminScanModal, 1500);
                    return;
                }
            }
        }
    } catch (e) { console.error(e); }

    setTimeout(runPremiumLivenessLoop, 200); // နှုန်းမှန် Scan ပတ်ရန်အချိန် (အရမ်းမမြန် အရမ်းမနှေး)
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function closeAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.add('hidden');
    if (activeStream) activeStream.getTracks().forEach(track => track.stop());
}

async function saveEmployee() {
    const dbId = document.getElementById('edit-db-id').value;
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const pos = document.getElementById('admin-emp-pos').value.trim();
    const faceData = document.getElementById('admin-face-data').value;

    if(!empId || !name || !pos) { alert("အချက်အလက်များ ဖြည့်စွက်ပါ"); return; }

    const payload = { emp_id: empId, name: name, position: pos };
    if(faceData) payload.face_data = faceData;

    if(dbId) {
        await supabaseClient.from('employees').update(payload).eq('id', dbId);
    } else {
        await supabaseClient.from('employees').insert([payload]);
    }

    alert("သိမ်းဆည်းပြီးပါပြီ");
    resetAdminForm();
    loadEmployeeTable();
    trainFaceMatcher();
}

function resetAdminForm() {
    document.getElementById('edit-db-id').value = "";
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-emp-pos').value = "";
    document.getElementById('admin-face-data').value = "";
    document.getElementById('face-status').innerText = "ဇီဝအချက်အလက် မရှိသေးပါ";
    document.getElementById('face-status').style.color = "var(--danger)";
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအသစ် စာရင်းသွင်းခြင်း";
}