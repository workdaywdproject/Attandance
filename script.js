// ==================== ၁။ SUPABASE CONFIGURATION ====================
const API_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const API_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";

let appSupabase;
try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        appSupabase = supabase.createClient(API_URL, API_KEY);
    } else {
        console.error("Supabase Library is missing from HTML.");
    }
} catch (err) {
    console.log("Supabase initialization caught: ", err.message);
}

window.globalCamStream = null;
let detectionTimer = null;

// ==================== ၂။ AI MODELS LOADING (GITHUB PAGES PATH FIX) ====================
async function loadFaceModels() {
    try {
        if (typeof faceapi === 'undefined') {
            console.error("FaceAPI Library is not loaded yet.");
            return;
        }
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const modelsPath = `${window.location.origin}${basePath}/models`;

        await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath);
        await faceapi.nets.faceExpressionNet.loadFromUri(modelsPath);
        console.log("Biometric Models Loaded Successfully.");
        
        if (typeof fetchEmployees === 'function') {
            fetchEmployees();
        }
    } catch (e) {
        alert("AI Models တင်ရသည်မှာ အဆင်မပြေပါ- " + e.message);
    }
}

window.onload = () => {
    loadFaceModels();
    if(document.getElementById('calendar')) {
        initCalendar();
    }
};

// ==================== ၃။ 3-STEP BIOMETRIC VERIFICATION (STRICT SINGLE ALERT) ====================
async function startFaceScan(role) {
    const isAdmin = (role === 'ADMIN');
    
    if(!isAdmin) {
        const id = document.getElementById('emp-id').value.trim();
        const name = document.getElementById('emp-name').value.trim();
        if(!id || !name) { alert("ဝန်ထမ်းကုဒ် နှင့် အမည်ကို ပြည့်စုံစွာ ဖြည့်သွင်းပါ။"); return; }
        document.getElementById('step-1').classList.add('hidden');
        document.getElementById('step-2').classList.remove('hidden');
    } else {
        document.getElementById('admin-cam-box').classList.remove('hidden');
    }

    const video = document.getElementById(isAdmin ? 'admin-video' : 'video');
    const instruction = document.getElementById(isAdmin ? 'admin-instruction' : 'instruction');

    const constraints = {
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.globalCamStream = stream; 
        video.srcObject = stream;
        
        video.setAttribute('playsinline', true);
        video.setAttribute('webkit-playsinline', true);
        video.muted = true;
        
        await video.play();

        let livenessStep = 'HEAD_TURN'; 
        let isWaiting = false; 
        let isFinished = false; // 🔒 Alert အကြိမ်ကြိမ်ပေါ်ခြင်းကို တားဆီးမည့် Security Gate
        const HOLD_DURATION = 1000; // စောင့်ဆိုင်းချိန် (၁) စက္ကန့်

        instruction.innerText = "[အဆင့် ၁/၃] အထောက်အထား စစ်ဆေးရန် ခေါင်းကို ဘယ်ဘက် (သို့မဟုတ်) ညာဘက်သို့ လှည့်ပေးပါ...";

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
                const noseBridge = landmarks.getNose()[3]; 
                const leftJaw = landmarks.getJawOutline()[0]; 
                const rightJaw = landmarks.getJawOutline()[16]; 
                const topJaw = landmarks.getJawOutline()[8]; 

                const distanceToLeft = Math.abs(nose.x - leftJaw.x);
                const distanceToRight = Math.abs(nose.x - rightJaw.x);
                const turnRatio = distanceToLeft / distanceToRight;
                const distanceNoseToChin = Math.abs(topJaw.y - noseBridge.y);

                // ------------------ [အဆင့် ၁] ခေါင်း ဘယ်ညာလှည့်ခြင်း ------------------
                if (livenessStep === 'HEAD_TURN') {
                    if (turnRatio < 0.55 || turnRatio > 1.85) {
                        isWaiting = true; 
                        
                        setTimeout(() => {
                            livenessStep = 'HEAD_NOD';
                            instruction.innerText = "[အဆင့် ၂/၃] ကျေးဇူးပြု၍ ခေါင်းကို အပေါ်သို့မော့ပါ (သို့မဟုတ်) အောက်သို့ညှိမ့်ပေးပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                } 
                // ------------------ [အဆင့် ၂] ခေါင်းအပေါ်မော့/အောက်ညှိမ့် ------------------
                else if (livenessStep === 'HEAD_NOD') {
                    if (distanceNoseToChin < 115 || distanceNoseToChin > 170) {
                        isWaiting = true;
                        
                        setTimeout(() => {
                            livenessStep = 'CAMERA_FOCUS';
                            instruction.innerText = "[အဆင့် ၃/၃] လုပ်ငန်းစဉ်ပြီးဆုံးရန် ကင်မရာကို ဗဟိုတည့်တည့် စိုက်ကြည့်ပေးပါ...";
                            isWaiting = false; 
                        }, HOLD_DURATION);
                    }
                }
                // ------------------ [အဆင့် ၃] ကင်မရာကို ဗဟိုတည့်တည့်ကြည့်ခြင်း ------------------
                else if (livenessStep === 'CAMERA_FOCUS') {
                    if (turnRatio >= 0.75 && turnRatio <= 1.35 && distanceNoseToChin >= 120 && distanceNoseToChin <= 165) { 
                        
                        isFinished = true; 
                        clearInterval(detectionTimer); // Interval ကို ချက်ချင်း ဖျက်ဆီးပစ်သည်
                        
                        instruction.innerText = "လုပ်ငန်းစဉ် ပြီးမြောက်သွားပါပြီ...";

                        setTimeout(() => {
                            if (isAdmin) {
                                document.getElementById('admin-face-data').value = JSON.stringify(Array.from(result.descriptor));
                                const faceStatus = document.getElementById('face-status');
                                if(faceStatus) {
                                    faceStatus.innerText = "✓ ဇီဝအချက်အလက် စစ်ဆေးမှု အောင်မြင်ပါသည်";
                                    faceStatus.style.color = "#10b981";
                                }
                                document.getElementById('admin-cam-box').classList.add('hidden');
                            } else {
                                document.getElementById('step-2').classList.add('hidden');
                                document.getElementById('step-3').classList.remove('hidden');
                            }

                            if (window.globalCamStream) {
                                window.globalCamStream.getTracks().forEach(track => track.stop());
                                window.globalCamStream = null;
                            }

                            // 🔔 တစ်ကြိမ်တည်းသာ တိကျစွာ ပြသမည်
                            alert("✓ အထောက်အထား စစ်ဆေးခြင်း လုပ်ငန်းစဉ် အောင်မြင်ပါသည်။");
                        }, HOLD_DURATION);
                    }
                }
            }
        }, 300); 

    } catch (err) {
        alert("ဗီဒီယိုစနစ် အလုပ်လုပ်ရန် အခက်အခဲရှိပါသည်- " + err.name);
    }
}

// ==================== ၄။ ADMIN OPERATIONS (CRUD) ====================
let isEditing = false;

async function checkDuplicateID() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    if (!empId || !appSupabase) return;

    const { data, error } = await appSupabase.from('employees').select('employee_id').eq('employee_id', empId);
    if (error) return;

    const btnSave = document.getElementById('btn-save');
    if (data.length > 0 && !isEditing) {
        alert("❌ ဤဝန်ထမ်းကုဒ်သည် စနစ်အတွင်း တည်ရှိပြီးသား ဖြစ်သည်။");
        document.getElementById('admin-emp-id').style.borderColor = "#ef4444";
        if(btnSave) { btnSave.disabled = true; btnSave.style.opacity = "0.5"; }
    } else {
        document.getElementById('admin-emp-id').style.borderColor = "#10b981";
        if(btnSave) { btnSave.disabled = false; btnSave.style.opacity = "1"; }
    }
}

async function saveEmployee() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const faceData = document.getElementById('admin-face-data').value;

    if (!empId || !name || !faceData || !appSupabase) { 
        alert("သတ်မှတ်ချက် အချက်အလက်များ ပြည့်စုံစွာ ဖြည့်သွင်းပါ။"); 
        return; 
    }

    let query;
    if (isEditing) {
        query = await appSupabase.from('employees').update({ name: name, face_embedding: faceData }).eq('employee_id', empId);
    } else {
        query = await appSupabase.from('employees').insert([{ employee_id: empId, name: name, face_embedding: faceData }]);
    }

    if (query.error) { 
        alert("သိမ်းဆည်းမှု မအောင်မြင်ပါ- " + query.error.message); 
    } else { 
        alert("ဝန်ထမ်းအချက်အလက် သိမ်းဆည်းခြင်း အောင်မြင်ပါသည်။"); 
        resetAdminForm(); 
        fetchEmployees(); 
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
                <td>${emp.employee_id}</td>
                <td>${emp.name}</td>
                <td style="color:#10b981; font-weight:600;">✓ အဆင်သင့်ဖြစ်ပါသည်</td>
                <td>
                    <button onclick="editEmployee('${emp.employee_id}', '${emp.name}', '${emp.face_embedding}')" class="btn-yellow" style="width:auto; padding:6px 12px; display:inline-block; font-size:0.85rem;">ပြင်ဆင်ရန်</button>
                    <button onclick="deleteEmployee('${emp.employee_id}')" class="btn-red" style="width:auto; padding:6px 12px; display:inline-block; font-size:0.85rem;">ပယ်ဖျက်ရန်</button>
                </td>
            </tr>`;
    });
}

function editEmployee(id, name, face) {
    document.getElementById('admin-emp-id').value = id;
    document.getElementById('admin-emp-id').disabled = true;
    document.getElementById('admin-emp-name').value = name;
    document.getElementById('admin-face-data').value = face;
    const faceStatus = document.getElementById('face-status');
    if(faceStatus) {
        faceStatus.innerText = "✓ ဇီဝအချက်အလက် ထည့်သွင်းပြီး";
        faceStatus.style.color = "#10b981";
    }
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ခြင်း";
    isEditing = true;
}

async function deleteEmployee(empId) {
    if (confirm("ဤဝန်ထမ်းအချက်အလက်အား ပယ်ဖျက်ရန် သေချာပါသလား?") && appSupabase) {
        await appSupabase.from('employees').delete().eq('employee_id', empId);
        fetchEmployees();
    }
}

function resetAdminForm() {
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-id').disabled = false;
    document.getElementById('admin-emp-id').style.borderColor = "#cbd5e1";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-face-data').value = "";
    const faceStatus = document.getElementById('face-status');
    if(faceStatus) {
        faceStatus.innerText = "ဇီဝအချက်အလက် မရှိသေးပါ";
        faceStatus.style.color = "#ef4444";
    }
    isEditing = false;
}

// ==================== ၅။ ATTENDANCE LOG SUBMIT ====================
function submitAttendance() {
    const id = document.getElementById('emp-id').value.trim();
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value;

    if (!appSupabase) return;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { error } = await appSupabase.from('attendance_logs').insert([
                { employee_id: id, type: type, latitude: position.coords.latitude, longitude: position.coords.longitude, remark: remark }
            ]);

            if (error) alert("မှတ်တမ်းတင်မှု မအောင်မြင်ပါ- " + error.message);
            else { alert("တက်ရောက်မှု မှတ်တမ်းတင်ခြင်း အောင်မြင်ပါသည်။"); location.reload(); }
        });
    } else { alert("GPS စနစ် အလုပ်လုပ်ရန် လိုအပ်ပါသည်။"); }
}

// ==================== ၆။ CALENDAR OPERATE ====================
async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl || !appSupabase) return;

    const { data: logs, error } = await appSupabase.from('attendance_logs').select(`*, employees ( name )`);
    if (error) return;

    const calendarEvents = logs.map(log => {
        const empName = log.employees ? log.employees.name : "Unknown";
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return {
            title: `${empName} (${log.type})`, 
            start: log.timestamp.split('T')[0], 
            extendedProps: {
                empId: log.employee_id, empName: empName,
                type: log.type === 'IN' ? 'အဝင် (Check-In)' : 'အထွက် (Check-Out)',
                time: timeStr, remark: log.remark || "မှတ်ချက်မရှိပါ",
                location: `Lat: ${log.latitude.toFixed(4)}, Lng: ${log.longitude.toFixed(4)}`,
                mapsLink: `https://www.google.com/maps?q=${log.latitude},${log.longitude}`
            },
            backgroundColor: log.type === 'IN' ? '#22c55e' : '#ef4444',
            borderColor: log.type === 'IN' ? '#16a34a' : '#dc2626'
        };
    });

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: calendarEvents,
        eventClick: function(info) {
            const props = info.event.extendedProps;
            document.getElementById('selected-date-title').innerText = `${info.event.startStr} ရက်စွဲမှတ်တမ်း`;
            document.getElementById('attendance-details').innerHTML = `
                <div class="detail-box">
                    <p><b>ဝန်ထမ်း အမည်:</b> <span style="color: #2563eb;">${props.empName}</span></p>
                    <p>ဝန်ထမ်းကုဒ်: ${props.empId}</p>
                </div>
                <div class="detail-text">
                    <p><b>အမျိုးအစား:</b> ${props.type}</p>
                    <p><b>အချိန်:</b> ${props.time}</p>
                    <p><b>မှတ်ချက်:</b> ${props.remark}</p>
                    <p><b>တည်နေရာ:</b> ${props.location}</p>
                    <a href="${props.mapsLink}" target="_blank" class="maps-link">📍 Google Maps တွင် ကြည့်ရန်</a>
                </div>`;
        }
    });
    calendar.render();
}