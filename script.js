// ==================== ၁။ SUPABASE CONFIGURATION ====================
const API_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const API_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";

const appSupabase = supabase.createClient(API_URL, API_KEY);

window.globalCamStream = null;
let detectionTimer = null;

// ==================== ၂။ AI MODELS LOADING ====================
async function loadFaceModels() {
    try {
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const modelsPath = `${window.location.origin}${basePath}/models`;

        await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath);
        await faceapi.nets.faceExpressionNet.loadFromUri(modelsPath);
        console.log("Biometric Models Loaded Successfully.");
    } catch (e) {
        alert("စနစ်အတွင်းပိုင်း နည်းပညာဆိုင်ရာ အမှားအယွင်းရှိပါသည်- " + e.message);
    }
}
loadFaceModels();

// ==================== ၃။ BINANCE STYLE HEAD-TURN LIVENESS DETECTION ====================
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
        video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
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

        // 🔄 Binance စံနှုန်းအတိုင်း ခေါင်းလှည့်ခိုင်းသည့် အဆင့်သတ်မှတ်ခြင်း
        let livenessStep = 'HEAD_TURN_CHECK'; 
        instruction.innerText = "စစ်မှန်မှု အတည်ပြုရန်အတွက် ကျေးဇူးပြု၍ ခေါင်းကို ဘယ်ဘက် (သို့မဟုတ်) ညာဘက်သို့ အနည်းငယ် လှည့်ပေးပါ...";

        if (detectionTimer) clearInterval(detectionTimer);

        detectionTimer = setInterval(async () => {
            if (video.paused || video.ended) return;

            const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks()
                                        .withFaceExpressions()
                                        .withFaceDescriptor();

            if (result) {
                const landmarks = result.landmarks;
                
                // 📐 နှာခေါင်း၊ မျက်နှာ ဘယ်ဘက်အစွန်းနှင့် ညာဘက်အစွန်း Point များကို ရယူခြင်း
                const nose = landmarks.getNose()[0]; 
                const leftJaw = landmarks.getJawOutline()[0]; 
                const rightJaw = landmarks.getJawOutline()[16]; 

                // နှာခေါင်းနှင့် မျက်နှာဘေးဘောင်နှစ်ဖက်၏ အကွာအဝေးအချိုးကို တွက်ချက်ခြင်း (X-Axis Ratio)
                const distanceToLeft = Math.abs(nose.x - leftJaw.x);
                const distanceToRight = Math.abs(nose.x - rightJaw.x);
                const turnRatio = distanceToLeft / distanceToRight;

                // အဆင့် ၁ - Head Turn Verification (ဘယ်လှည့်လှည့်၊ ညာလှည့်လှည့် စစ်ဆေးမှု ဖြတ်သန်းခြင်း)
                if (livenessStep === 'HEAD_TURN_CHECK') {
                    // turnRatio < 0.5 (ညာဘက်သို့လှည့်ခြင်း) သို့မဟုတ် turnRatio > 2.0 (ဘယ်ဘက်သို့လှည့်ခြင်း)
                    if (turnRatio < 0.50 || turnRatio > 2.00) {
                        livenessStep = 'STABILITY_CHECK'; 
                        instruction.innerText = "လုပ်ငန်းစဉ် ပြီးဆုံးရန်အတွက် ကင်မရာကို တည့်တည့်ကြည့်ပြီး ခေတ္တငြိမ်ပေးပါ...";
                    }
                } 
                // အဆင့် ၂ - Static Biometric Stability Check (မျက်နှာပြန်တည့်ပြီး တည်ငြိမ်မှုကို တိုင်းတာခြင်း)
                else if (livenessStep === 'STABILITY_CHECK') {
                    // မျက်နှာ ပြန်လည်တည့်မတ်ပြီး တည်ငြိမ်သွားသည့် အခြေအနေ (Ratio 0.7 မှ 1.4 အတွင်း ပုံမှန်အနေအထား)
                    if (turnRatio >= 0.70 && turnRatio <= 1.40) { 
                        
                        clearInterval(detectionTimer);

                        if (isAdmin) {
                            document.getElementById('admin-face-data').value = JSON.stringify(Array.from(result.descriptor));
                            const faceStatus = document.getElementById('face-status');
                            faceStatus.innerText = "✓ ဇီဝအချက်အလက် စစ်ဆေးမှု အောင်မြင်ပါသည်";
                            faceStatus.style.color = "#10b981";
                            document.getElementById('admin-cam-box').classList.add('hidden');
                        } else {
                            document.getElementById('step-2').classList.add('hidden');
                            document.getElementById('step-3').classList.remove('hidden');
                        }

                        // ကင်မရာ ပိတ်သိမ်းခြင်း
                        if (window.globalCamStream) {
                            window.globalCamStream.getTracks().forEach(track => track.stop());
                            window.globalCamStream = null;
                        }

                        alert("✓ အထောက်အထား စစ်ဆေးခြင်း လုပ်ငန်းစဉ် အောင်မြင်ပါသည်။");
                    }
                }
            }
        }, 400); // ပိုမိုမြန်ဆန်စွာ ဖမ်းယူနိုင်ရန် 400ms သို့ လျှော့ချထားပါသည်

    } catch (err) {
        alert("ဗီဒီယိုစနစ် အလုပ်လုပ်ရန် အခက်အခဲရှိပါသည်- " + err.name);
    }
}

// ==================== ၄။ ADMIN OPERATIONS (CRUD) ====================
let isEditing = false;

async function checkDuplicateID() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    if (!empId) return;

    const { data, error } = await appSupabase.from('employees').select('employee_id').eq('employee_id', empId);
    if (error) return;

    const btnSave = document.getElementById('btn-save');
    if (data.length > 0 && !isEditing) {
        alert("❌ ဤဝန်ထမ်းကုဒ်သည် စနစ်အတွင်း တည်ရှိပြီးသား ဖြစ်သည်။");
        document.getElementById('admin-emp-id').style.borderColor = "#ef4444";
        btnSave.disabled = true;
        btnSave.style.opacity = "0.5";
    } else {
        document.getElementById('admin-emp-id').style.borderColor = "#10b981";
        btnSave.disabled = false;
        btnSave.style.opacity = "1";
    }
}

async function saveEmployee() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const faceData = document.getElementById('admin-face-data').value;

    if (!empId || !name || !faceData) { 
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
    const { data: employees, error } = await appSupabase.from('employees').select('*').order('created_at', { ascending: false });
    if (error) return;

    const tableBody = document.getElementById('employee-table-body');
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
    document.getElementById('face-status').innerText = "✓ ဇီဝအချက်အလက် ထည့်သွင်းပြီး";
    document.getElementById('face-status').style.color = "#10b981";
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ခြင်း";
    isEditing = true;
}

async function deleteEmployee(empId) {
    if (confirm("ဤဝန်ထမ်းအချက်အလက်အား ปယ်ဖျက်ရန် သေချာပါသလား?")) {
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
    document.getElementById('face-status').innerText = "ဇီဝအချက်အလက် မရှိသေးပါ";
    document.getElementById('face-status').style.color = "#ef4444";
    isEditing = false;
}

// ==================== ၅။ ATTENDANCE LOG SUBMIT ====================
function submitAttendance() {
    const id = document.getElementById('emp-id').value.trim();
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value;

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
    if(!calendarEl) return;

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