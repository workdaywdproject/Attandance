// ==================== ၁။ SUPABASE CONFIGURATION ====================
const API_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const API_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";

let appSupabase;
try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        appSupabase = supabase.createClient(API_URL, API_KEY);
    } else {
        console.error("Supabase Library Reference Error.");
    }
} catch (err) {
    console.log("Supabase initialization caught: ", err.message);
}

window.globalCamStream = null;
let detectionTimer = null;

// ==================== CUSTOM POP-UP GLOBAL STATUS MODAL ====================
let postStatusAction = null;

function showStatus(type, title, message, callback = null) {
    const modal = document.getElementById('status-modal');
    const titleEl = document.getElementById('status-title');
    const msgEl = document.getElementById('status-message');
    const btnEl = document.getElementById('status-btn');

    if (!modal) {
        if (callback) callback();
        return;
    }

    if (type === 'success') {
        titleEl.style.color = "var(--success)";
        btnEl.className = "btn-green";
    } else {
        titleEl.style.color = "var(--danger)";
        btnEl.className = "btn-red";
    }

    titleEl.innerText = title;
    msgEl.innerText = message;
    postStatusAction = callback;
    modal.classList.remove('hidden');
}

function closeStatusModal() {
    const modal = document.getElementById('status-modal');
    if (modal) modal.classList.add('hidden');
    if (postStatusAction) {
        postStatusAction();
        postStatusAction = null;
    }
}

// ==================== 📸 WEBCAM MODAL MANAGEMENT ====================
function openScanModal() {
    document.getElementById('scan-modal').classList.remove('hidden');
    startAutoFaceScan();
}

function closeScanModal() {
    if (detectionTimer) clearInterval(detectionTimer);
    if (window.globalCamStream) {
        window.globalCamStream.getTracks().forEach(track => track.stop());
        window.globalCamStream = null;
    }
    document.getElementById('scan-modal').classList.add('hidden');
}

function openAdminScanModal() {
    document.getElementById('admin-scan-modal').classList.remove('hidden');
    startFaceScan('ADMIN');
}

function closeAdminScanModal() {
    if (detectionTimer) clearInterval(detectionTimer);
    if (window.globalCamStream) {
        window.globalCamStream.getTracks().forEach(track => track.stop());
        window.globalCamStream = null;
    }
    document.getElementById('admin-scan-modal').classList.add('hidden');
}

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        closeScanModal();
        closeAdminScanModal();
        closeStatusModal();
        if(typeof closeConfirmModal === 'function') closeConfirmModal();
        if(typeof closeDeleteModal === 'function') closeDeleteModal();
    }
});

// ==================== ၂။ ADMIN CREDENTIALS & ACCOUNT OPERATIONS ====================
// (က) ရှိပြီးသား Admin ရဲ့ Username ကော Password ပါ တစ်ပြိုင်တည်း ပြောင်းလဲရန်
async function updateAdminAccount() {
    const newUser = document.getElementById('update-admin-user').value.trim();
    const newPass = document.getElementById('update-admin-pass').value.trim();

    if(!newUser || !newPass) { 
        showStatus('error', 'သတိပေးချက်', 'အသုံးပြုသူအမည်သစ်နှင့် စကားဝှက်သစ် ဖြည့်သွင်းပါ။'); 
        return; 
    }
    if(newPass.length < 6) { 
        showStatus('error', 'သတိပေးချက်', 'စကားဝှက်သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်။'); 
        return; 
    }
    if(!appSupabase) return;

    // အလွယ်တကူ လက်ရှိ Session ထဲက Admin တစ်ခုတည်းကို ပြောင်းလဲပေးခြင်း
    const { error } = await appSupabase
        .from('admin_settings')
        .update({ username: newUser, password: newPass })
        .eq('id', 1); 

    if(error) {
        showStatus('error', 'မအောင်မြင်ပါ', error.message);
    } else {
        showStatus('success', 'အောင်မြင်ပါသည်', 'Admin အကောင့် အထောက်အထားများ ပြောင်းလဲပြီးပါပြီ။', () => {
            document.getElementById('update-admin-user').value = "";
            document.getElementById('update-admin-pass').value = "";
        });
    }
}

// (ခ) စီမံခန့်ခွဲသူ (Admin အသစ်) ထပ်မံထည့်သွင်းရန်
async function createNewAdminAccount() {
    const adminUser = document.getElementById('new-admin-user').value.trim();
    const adminPass = document.getElementById('new-admin-pass').value.trim();

    if(!adminUser || !adminPass) { 
        showStatus('error', 'သတိပေးချက်', 'Admin အသစ်အတွက် အသုံးပြုသူအမည်နှင့် စကားဝှက် ဖြည့်သွင်းပါ။'); 
        return; 
    }
    if(adminPass.length < 6) {
        showStatus('error', 'သတိပေးချက်', 'စကားဝှက်သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်။');
        return;
    }
    if(!appSupabase) return;

    const { error } = await appSupabase
        .from('admin_settings')
        .insert([{ username: adminUser, password: adminPass }]);

    if(error) {
        showStatus('error', 'မအောင်မြင်ပါ', error.message);
    } else {
        showStatus('success', 'အောင်မြင်ပါသည်', 'စီမံခန့်ခွဲသူ (Admin အသစ်) အား အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ။', () => {
            document.getElementById('new-admin-user').value = "";
            document.getElementById('new-admin-pass').value = "";
        });
    }
}

function handleLogout() {
    sessionStorage.removeItem('admin_authenticated');
    window.location.replace('portal.html');
}

// ==================== ၃။ AI MODELS LOADING ====================
async function loadFaceModels() {
    try {
        if (typeof faceapi === 'undefined') return;
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const modelsPath = `${window.location.origin}${basePath}/models`;

        await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath);
        await faceapi.nets.faceExpressionNet.loadFromUri(modelsPath);
        console.log("Biometric Models Loaded.");
        
        if (document.getElementById('employee-table-body') && sessionStorage.getItem('admin_authenticated') === 'true') {
            fetchEmployees();
        }
    } catch (e) {
        console.log("AI Models status: " + e.message);
    }
}

window.onload = () => {
    loadFaceModels();
    if(document.getElementById('calendar')) {
        initCalendar();
    }
};

// ==================== ၄။ BIOMETRIC AUTO-RECOGNITION VERIFICATION ====================
let matchedEmployeeId = null;
let matchedEmployeeName = null;
let matchedEmployeePos = null;

async function startAutoFaceScan() {
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');
    if(!video || !instruction) return;

    const constraints = {
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.globalCamStream = stream; 
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        await video.play();

        let livenessStep = 'HEAD_TURN'; 
        let isWaiting = false; 
        let isFinished = false; 
        const HOLD_DURATION = 1500; 

        instruction.innerText = "ဦးခေါင်းကို ဘယ်/ညာသို့ ဖြည်းညှင်းစွာ လှည့်ပေးပါ...";

        if (detectionTimer) clearInterval(detectionTimer);

        detectionTimer = setInterval(async () => {
            if (video.paused || video.ended || isWaiting || isFinished) return;

            const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks()
                                        .withFaceExpressions()
                                        .withFaceDescriptor();

            if (result) {
                const landmarks = result.landmarks;
                const nose = landmarks.getNose()[0]; 
                const leftJaw = landmarks.getJawOutline()[0]; 
                const rightJaw = landmarks.getJawOutline()[16]; 
                const topJaw = landmarks.getJawOutline()[8]; 
                const noseBridge = landmarks.getNose()[3]; 

                const distanceToLeft = Math.abs(nose.x - leftJaw.x);
                const distanceToRight = Math.abs(nose.x - rightJaw.x);
                const turnRatio = distanceToLeft / distanceToRight;
                const distanceNoseToChin = Math.abs(topJaw.y - noseBridge.y);

                if (livenessStep === 'HEAD_TURN') {
                    if (turnRatio < 0.50 || turnRatio > 1.90) {
                        isWaiting = true; 
                        instruction.innerText = "ခဏလေး Ngim ပေးပါ...";
                        setTimeout(() => {
                            livenessStep = 'HEAD_NOD';
                            instruction.innerText = "ဦးခေါင်းကို အပေါ်/အောက်သို့ အနည်းငယ် လှည့်ပေးပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                } 
                else if (livenessStep === 'HEAD_NOD') {
                    if (distanceNoseToChin < 112 || distanceNoseToChin > 172) {
                        isWaiting = true;
                        instruction.innerText = "ခဏလေး Ngim ပေးပါ...";
                        setTimeout(() => {
                            livenessStep = 'CAMERA_FOCUS';
                            instruction.innerText = "ကင်မရာတည့်တည့်သို့ စိုက်ကြည့်ပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                }
                else if (livenessStep === 'CAMERA_FOCUS') {
                    if (turnRatio >= 0.70 && turnRatio <= 1.40) { 
                        isFinished = true; 
                        clearInterval(detectionTimer); 
                        instruction.innerText = "အချက်အလက်များအား စစ်ဆေးနေပါသည်...";

                        const currentDescriptor = result.descriptor;
                        const isRecognized = await matchFaceWithDatabase(currentDescriptor);

                        closeScanModal(); 

                        if(isRecognized) {
                            showStatus('success', 'စစ်ဆေးမှုအောင်မြင်ပါသည်', 'ဝန်ထမ်းအထောက်အထား ကိုက်ညီမှုရှိပါသည်။', () => {
                                document.getElementById('step-1').classList.add('hidden');
                                document.getElementById('recognized-name').innerText = matchedEmployeeName;
                                document.getElementById('recognized-pos').innerText = matchedEmployeePos;
                                document.getElementById('recognized-id').innerText = matchedEmployeeId;
                                document.getElementById('step-2').classList.remove('hidden');
                            });
                        } else {
                            showStatus('error', 'မအောင်မြင်ပါ', 'ဝန်ထမ်းမှတ်တမ်း ရှာမတွေ့ပါ။', () => {
                                location.reload();
                            });
                        }
                    }
                }
            }
        }, 600); 

    } catch (err) {
        closeScanModal();
        showStatus('error', 'ချိတ်ဆက်မှုပရာဇယ', 'ဗီဒီယိုစနစ် ချိတ်ဆက်မှု မအောင်မြင်ပါ: ' + err.name);
    }
}

async function matchFaceWithDatabase(currentDescriptor) {
    if (!appSupabase) return false;

    const { data: employees, error } = await appSupabase.from('employees').select('employee_id, name, position, face_embedding');
    if (error || !employees) return false;

    let bestMatch = null;
    let threshold = 0.55; 

    for (const emp of employees) {
        if (!emp.face_embedding) continue;
        try {
            const savedDescriptor = new Float32Array(JSON.parse(emp.face_embedding));
            let distance = 0;
            for (let i = 0; i < currentDescriptor.length; i++) {
                distance += Math.pow(currentDescriptor[i] - savedDescriptor[i], 2);
            }
            distance = Math.sqrt(distance);

            if (distance < threshold) {
                threshold = distance;
                bestMatch = emp;
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (bestMatch) {
        matchedEmployeeId = bestMatch.employee_id;
        matchedEmployeeName = bestMatch.name;
        matchedEmployeePos = bestMatch.position || "Staff";
        return true;
    }
    return false;
}

// ==================== ၄။(ခ) BIOMETRIC ENROLLMENT SCAN (ADMIN) ====================
async function startFaceScan(role) {
    if(role !== 'ADMIN') return;
    const video = document.getElementById('admin-video');
    const instruction = document.getElementById('admin-instruction');
    if(!video || !instruction) return;

    const constraints = { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.globalCamStream = stream; 
        video.srcObject = stream;
        await video.play();

        let livenessStep = 'HEAD_TURN'; 
        let isWaiting = false; 
        let isFinished = false; 
        const HOLD_DURATION = 1500; 

        instruction.innerText = "ဦးခေါင်းကို ဘယ်/ညာသို့ ဖြည်းညှင်းစွာ လှည့်ပေးပါ...";

        if (detectionTimer) clearInterval(detectionTimer);

        detectionTimer = setInterval(async () => {
            if (video.paused || video.ended || isWaiting || isFinished) return;

            const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions().withFaceDescriptor();

            if (result) {
                const landmarks = result.landmarks;
                const nose = landmarks.getNose()[0]; 
                const leftJaw = landmarks.getJawOutline()[0]; 
                const rightJaw = landmarks.getJawOutline()[16]; 
                const topJaw = landmarks.getJawOutline()[8]; 
                const noseBridge = landmarks.getNose()[3]; 

                const distanceToLeft = Math.abs(nose.x - leftJaw.x);
                const distanceToRight = Math.abs(nose.x - rightJaw.x);
                const turnRatio = distanceToLeft / distanceToRight;
                const distanceNoseToChin = Math.abs(topJaw.y - noseBridge.y);

                if (livenessStep === 'HEAD_TURN') {
                    if (turnRatio < 0.50 || turnRatio > 1.90) {
                        isWaiting = true; 
                        instruction.innerText = "ခဏလေး Ngim ပေးပါ...";
                        setTimeout(() => {
                            livenessStep = 'HEAD_NOD';
                            instruction.innerText = "ဦးခေါင်းကို အပေါ်/အောက်သို့ အနည်းငယ် လှည့်ပေးပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                } 
                else if (livenessStep === 'HEAD_NOD') {
                    if (distanceNoseToChin < 112 || distanceNoseToChin > 172) {
                        isWaiting = true;
                        instruction.innerText = "ခဏလေး Ngim ပေးပါ...";
                        setTimeout(() => {
                            livenessStep = 'CAMERA_FOCUS';
                            instruction.innerText = "ကင်မရာတည့်တည့်သို့ စိုက်ကြည့်ပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                }
                else if (livenessStep === 'CAMERA_FOCUS') {
                    if (turnRatio >= 0.70 && turnRatio <= 1.40) { 
                        isFinished = true; 
                        clearInterval(detectionTimer); 
                        instruction.innerText = "လုပ်ငန်းစဉ် ပြီးမြောက်ပါပြီ...";

                        setTimeout(() => {
                            document.getElementById('admin-face-data').value = JSON.stringify(Array.from(result.descriptor));
                            const faceStatus = document.getElementById('face-status');
                            if(faceStatus) {
                                faceStatus.innerText = "ဇီဝအချက်အလက် စစ်ဆေးမှု အောင်မြင်ပါသည်";
                                faceStatus.style.color = "var(--success)";
                            }
                            closeAdminScanModal();
                            showStatus('success', 'အောင်မြင်ပါသည်', 'ဇီဝအချက်အလက် မှတ်တမ်းယူခြင်း အောင်မြင်ပါသည်။');
                        }, HOLD_DURATION);
                    }
                }
            }
        }, 600); 
    } catch (err) { 
        closeAdminScanModal();
        showStatus('error', 'အမှားအယွင်း', 'ဗီဒီယိုစနစ် ချိတ်ဆက်မှု မအောင်မြင်ပါ: ' + err.name); 
    }
}

// ==================== ၅။ EMPLOYEE DATA MANAGEMENT (CRUD) ====================
async function checkDuplicateID() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    if (!empId || !appSupabase) return;

    const { data, error } = await appSupabase.from('employees').select('employee_id').eq('employee_id', empId);
    if (error) return;

    const btnSave = document.getElementById('btn-save');
    if (data.length > 0 && !isEditing) {
        showStatus('error', 'သтириပေးချက်', 'ဤဝန်ထမ်းကုဒ်သည် စနစ်အတွင်း တည်ရှိပြီးဖြစ်သည်။');
        document.getElementById('admin-emp-id').style.borderColor = "var(--danger)";
        if(btnSave) { btnSave.disabled = true; btnSave.style.opacity = "0.5"; }
    } else {
        document.getElementById('admin-emp-id').style.borderColor = "var(--success)";
        if(btnSave) { btnSave.disabled = false; btnSave.style.opacity = "1"; }
    }
}

async function saveEmployee() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const position = document.getElementById('admin-emp-pos').value.trim() || "Staff";
    const faceData = document.getElementById('admin-face-data').value;

    if (!empId || !name || !faceData || !appSupabase) { 
        showStatus('error', 'သတိပေးချက်', 'လိုအပ်သော အချက်အလက်များ ပြည့်စုံစွာ ဖြည့်သွင်းပါ။'); 
        return; 
    }

    let query;
    if (isEditing) {
        query = await appSupabase.from('employees').update({ name: name, position: position, face_embedding: faceData }).eq('employee_id', empId);
    } else {
        query = await appSupabase.from('employees').insert([{ employee_id: empId, name: name, position: position, face_embedding: faceData }]);
    }

    if (query.error) { 
        showStatus('error', 'မအောင်မြင်ပါ', query.error.message); 
    } else { 
        showStatus('success', 'အောင်မြင်ပါသည်', 'ဝန်ထမ်းအချက်အလက် သိမ်းဆည်းမှု အောင်မြင်ပါသည်။', () => {
            resetAdminForm(); 
            fetchEmployees(); 
        });
    }
}

async function fetchEmployees() {
    const tableBody = document.getElementById('employee-table-body');
    if (!tableBody || !appSupabase) return;

    const { data: employees, error } = await appSupabase.from('employees').select('*').order('created_at', { ascending: false });
    if (error) return;

    tableBody.innerHTML = "";
    employees.forEach(emp => {
        tableBody.innerHTML += `
            <tr>
                <td><b>${emp.employee_id}</b></td>
                <td>${emp.name}</td>
                <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.85rem;">${emp.position || 'Staff'}</span></td>
                <td>
                    <div class="button-row">
                        <button onclick="editEmployee('${emp.employee_id}', '${emp.name}', '${emp.position || 'Staff'}', '${emp.face_embedding}')" class="btn-yellow" style="padding:4px 8px; font-size:0.8rem; width:auto;">ပြင်ဆင်ရန်</button>
                        <button onclick="triggerDelete('${emp.employee_id}')" class="btn-red" style="padding:4px 8px; font-size:0.8rem; width:auto;">ပယ်ဖျက်ရန်</button>
                    </div>
                </td>
            </tr>`;
    });
}

let isEditing = false;
let targetDeleteId = null;

function editEmployee(id, name, position, face) {
    document.getElementById('admin-emp-id').value = id;
    document.getElementById('admin-emp-id').disabled = true;
    document.getElementById('admin-emp-name').value = name;
    document.getElementById('admin-emp-pos').value = position;
    document.getElementById('admin-face-data').value = face;
    const faceStatus = document.getElementById('face-status');
    if(faceStatus) {
        faceStatus.innerText = "ဇီဝအချက်အလက် ထည့်သွင်းပြီး";
        faceStatus.style.color = "var(--success)";
    }
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ခြင်း";
    isEditing = true;

    // အလိုအလျောက် ဝန်ထမ်းထည့်သွင်းခြင်း Tab သို့ ရွှေ့ပေးရန်
    const menuBtns = document.querySelectorAll('.nav-menu-btn');
    menuBtns.forEach(btn => {
        if(btn.innerText.includes("ဝန်ထမ်းအသစ်ထည့်ရန်")) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.nav-menu-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('add-employee-tab').classList.add('active');
            btn.classList.add('active');
            document.getElementById('current-panel-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ခြင်း";
        }
    });
}

function triggerDelete(empId) {
    targetDeleteId = empId;
    const delModal = document.getElementById('delete-modal');
    if(delModal) {
        delModal.classList.remove('hidden');
        document.getElementById('delete-confirm-btn').onclick = executeDelete;
    }
}

function closeDeleteModal() {
    const delModal = document.getElementById('delete-modal');
    if(delModal) delModal.classList.add('hidden');
    targetDeleteId = null;
}

async function executeDelete() {
    if (targetDeleteId && appSupabase) {
        const { error } = await appSupabase.from('employees').delete().eq('employee_id', targetDeleteId);
        closeDeleteModal();
        if(error) {
            showStatus('error', 'မအောင်မြင်ပါ', error.message);
        } else {
            showStatus('success', 'အောင်မြင်ပါသည်', 'မှတ်တမ်းအား ပယ်ဖျက်ပြီးပါပြီ။', () => {
                fetchEmployees();
            });
        }
    }
}

function resetAdminForm() {
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-id').disabled = false;
    document.getElementById('admin-emp-id').style.borderColor = "var(--border)";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-emp-pos').value = "";
    document.getElementById('admin-face-data').value = "";
    const faceStatus = document.getElementById('face-status');
    if(faceStatus) {
        faceStatus.innerText = "ဇီဝအချက်အလက် မရှိသေးပါ";
        faceStatus.style.color = "var(--danger)";
    }
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် စာရင်းသွင်းခြင်း";
    isEditing = false;
}

// ==================== ၆။ ATTENDANCE TRANSACTION LOGIC ====================
function showConfirmModal() {
    const typeRadio = document.querySelector('input[name="attendance-type"]:checked').value;
    const typeText = (typeRadio === 'IN') ? "Check-In" : "Check-Out";
    const remarkText = document.getElementById('remark').value.trim() || "မရှိပါ";

    document.getElementById('conf-id').innerText = matchedEmployeeId;
    document.getElementById('conf-name').innerText = matchedEmployeeName;
    document.getElementById('conf-pos').innerText = matchedEmployeePos;
    document.getElementById('conf-type').innerText = typeText;
    document.getElementById('conf-remark').innerText = remarkText;

    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

function submitAttendance() {
    if (!appSupabase || !matchedEmployeeId) return;

    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value;

    closeConfirmModal(); 

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { error } = await appSupabase.from('attendance_logs').insert([
                { 
                    employee_id: matchedEmployeeId, 
                    type: type, 
                    latitude: position.coords.latitude, 
                    longitude: position.coords.longitude, 
                    remark: remark 
                }
            ]);

            if (error) {
                showStatus('error', 'မအောင်မြင်ပါ', error.message);
            } else { 
                showStatus('success', 'အောင်မြင်ပါသည်', 'တက်ရောက်မှုမှတ်တမ်း တင်ပြခြင်း အောင်မြင်ပါသည်။', () => {
                    location.reload();
                });
            }
        }, (geoErr) => {
            showStatus('error', 'GPS လိုအပ်ချက်', 'GPS စနစ် အသုံးပြုခွင့် ပေးရန် လိုအပ်ပါသည်။');
        });
    } else { 
        showStatus('error', 'စနစ်လိုအပ်ချက်', 'တည်နေရာပြစနစ်အား အသုံးပြု၍မရပါ။'); 
    }
}

// ==================== ၇။ FULLCALENDAR DASHBOARD GENERATOR ====================
async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl || !appSupabase) return;

    const { data: logs, error } = await appSupabase.from('attendance_logs').select(`*, employees ( name, position )`);
    if (error) return;

    const calendarEvents = logs.map(log => {
        const empName = log.employees ? log.employees.name : "Unknown";
        const empPos = log.employees ? (log.employees.position || "Staff") : "Staff";
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return {
            title: `${empName} (${log.type})`, 
            start: log.timestamp.split('T')[0], 
            extendedProps: {
                empId: log.employee_id, empName: empName, empPos: empPos,
                type: log.type === 'IN' ? 'Check-In' : 'Check-Out',
                time: timeStr, remark: log.remark || "မရှိပါ",
                location: `Lat: ${log.latitude.toFixed(4)}, Lng: ${log.longitude.toFixed(4)}`,
                mapsLink: `https://maps.google.com/?q=${log.latitude},${log.longitude}`
            },
            backgroundColor: log.type === 'IN' ? '#10b981' : '#ef4444',
            borderColor: log.type === 'IN' ? '#10b981' : '#ef4444'
        };
    });

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: calendarEvents,
        eventClick: function(info) {
            const props = info.event.extendedProps;
            document.getElementById('selected-date-title').innerText = `${info.event.startStr} မှတ်တမ်းအသေးစိတ်`;
            document.getElementById('attendance-details').innerHTML = `
                <div class="detail-box">
                    <p><b>ဝန်ထမ်းအမည်:</b> <span style="color: var(--primary); font-weight:600;">${props.empName}</span></p>
                    <p style="font-size:0.85rem; color:var(--text-muted);">ရာထူး: ${props.empPos}</p>
                    <p style="font-size:0.8rem; color:var(--text-muted);">ဝန်ထမ်းကုဒ်: ${props.empId}</p>
                </div>
                <div class="detail-text" style="margin-top:10px;">
                    <p><b>အမျိုးအစား:</b> ${props.type}</p>
                    <p><b>အချိန်:</b> ${props.time}</p>
                    <p><b>မှတ်ချက်:</b> ${props.remark}</p>
                    <p><b>တည်နေရာ:</b> ${props.location}</p>
                    <a href="${props.mapsLink}" target="_blank" class="maps-link">Google Maps တွင် ကြည့်ရှုရန်</a>
                </div>`;
        }
    });
    calendar.render();
}