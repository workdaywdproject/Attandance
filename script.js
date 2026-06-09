// ==================== ၁။ SUPABASE CONFIGURATION ====================
// သင်ပေးပို့ထားသော API URL နှင့် Key အစစ်အမှန်များအား နေရာချထားပြီးဖြစ်ပါသည်
const API_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const API_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";

// Global Variable နာမည်ငြိ၍ JavaScript Crash ခြင်းမှ ကာကွယ်ရန် 'appSupabase' ဟု သုံးထားပါသည်
const appSupabase = supabase.createClient(API_URL, API_KEY);

// ==================== ၂။ AI MODELS LOADING ====================
async function loadFaceModels() {
    try {
        // GitHub Pages ပေါ်တွင် Model များ သေချာပေါက် Read နိုင်ရန် Loading စနစ်
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        console.log("Face-API Liveness Models Loaded successfully!");
    } catch (e) {
        alert("AI Models တင်ရသည်မှာ အဆင်မပြေပါ (Folder တည်နေရာ ပြန်စစ်ပါ)- " + e.message);
    }
}
loadFaceModels();

// ==================== ၃။ BINANCE STYLE LIVENESS CAMERA DETECTION ====================
let localStream = null;
let detectionTimer = null;

async function startFaceScan(role) {
    const isAdmin = (role === 'ADMIN');
    
    if(!isAdmin) {
        const id = document.getElementById('emp-id').value.trim();
        const name = document.getElementById('emp-name').value.trim();
        if(!id || !name) { alert("ID နှင့် နာမည်ကို ပြည့်စုံစွာ ဖြည့်ပါ"); return; }
        document.getElementById('step-1').classList.add('hidden');
        document.getElementById('step-2').classList.remove('hidden');
    } else {
        document.getElementById('admin-cam-box').classList.remove('hidden');
    }

    const video = document.getElementById(isAdmin ? 'admin-video' : 'video');
    const instruction = document.getElementById(isAdmin ? 'admin-instruction' : 'instruction');

    // 🤖 Android နှင့် 🍏 iOS (iPhone Safari) နှစ်ခုလုံးတွင် ရာနှုန်းပြည့် ကင်မရာပွင့်စေမည့် Mobile Constraints
    const constraints = {
        video: {
            facingMode: "user", // ရှေ့ကင်မရာကို အတင်းစနစ်ဖြင့် တောင်းဆိုခြင်း
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            localStream = stream;
            video.srcObject = stream;
            
            // 🚨 CRITICAL FOR IOS: iPhone ပေါ်တွင် ဗီဒီယို Full Screen မပွင့်ဘဲ Inline အလုပ်လုပ်ရန် မဖြစ်မနေ လိုအပ်ပါသည်
            video.setAttribute('playsinline', true);
            video.setAttribute('webkit-playsinline', true);
            video.muted = true;
            video.play().catch(e => console.log("Video play error: ", e));

            let actionSteps = ['BLINK', 'SMILE'];
            let stepPointer = 0;
            instruction.innerText = "😉 ကျေးဇူးပြု၍ မျက်တောင် ခတ်ပေးပါ...";

            // စကန်ဖတ်နှုန်းကို ဖုန်းများ လေးမသွားစေရန် 500ms (တစ်စက္ကန့် နှစ်ကြိမ်) သို့ ညှိထားပါသည်
            detectionTimer = setInterval(async () => {
                if (video.paused || video.ended) return;

                const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                            .withFaceLandmarks()
                                            .withFaceExpressions()
                                            .withFaceDescriptor();

                if (result) {
                    // အဆင့် ၁ - မျက်တောင်ခတ်ခြင်း တိုက်စစ်ခြင်း
                    if (actionSteps[stepPointer] === 'BLINK') {
                        const landmarks = result.landmarks;
                        const leftEye = landmarks.getLeftEye();
                        const rightEye = landmarks.getRightEye();
                        
                        const leftEyeHeight = Math.abs(leftEye[1].y - leftEye[5].y);
                        const rightEyeHeight = Math.abs(rightEye[1].y - rightEye[5].y);
                        
                        // မျက်တောင်မှိတ်လိုက်သည့်အခါ အမြင့် ၃.၈ အောက် လျော့နည်းသွားမှုကို ဖမ်းယူခြင်း
                        if (leftEyeHeight < 3.8 || rightEyeHeight < 3.8) {
                            stepPointer++;
                            instruction.innerText = "😃 ကျေးဇူးပြု၍ ပြုံးပြပေးပါ...";
                        }
                    } 
                    // အဆင့် ၂ - ပြုံးပြခြင်း တိုက်စစ်ခြင်း (Kbz, Binance Style)
                    else if (actionSteps[stepPointer] === 'SMILE') {
                        if (result.expressions.happy > 0.65) { 
                            
                            if (isAdmin) {
                                // မျက်နှာ၏ Vector array 128 တန်ဖိုးအား Text အဖြစ် ပြောင်းလဲသိမ်းဆည်းခြင်း
                                document.getElementById('admin-face-data').value = JSON.stringify(Array.from(result.descriptor));
                                const faceStatus = document.getElementById('face-status');
                                faceStatus.innerText = "✓ Face Data: စကန်ဖတ်ပြီးပါပြီ (အဆင်သင့်ဖြစ်သည်)";
                                faceStatus.style.color = "#10b981";
                                document.getElementById('admin-cam-box').classList.add('hidden');
                            } else {
                                document.getElementById('step-2').classList.add('hidden');
                                document.getElementById('step-3').classList.remove('hidden');
                            }

                            // အောင်မြင်ပြီးဆုံးပါက နောက်ကွယ်မှ လုပ်ငန်းစဉ်များအားလုံးအား ရပ်နားပြီး ကင်မရာပိတ်ခြင်း
                            clearInterval(detectionTimer);
                            if(localStream) {
                                localStream.getTracks().forEach(track => track.stop());
                            }
                            alert("✓ မျက်နှာ စစ်ဆေးမှု (Liveness Check) အောင်မြင်ပါသည်။");
                        }
                    }
                }
            }, 500); 
        })
        .catch(err => {
            alert("ကင်မရာ ဖွင့်မရခြင်း အကြောင်းရင်း: " + err.name + "\nကျေးဇူးပြု၍ Browser Setting တွင် Camera Permission ခွင့်ပြုထားကြောင်း ထပ်မံစစ်ဆေးပေးပါ။");
        });
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
        alert("❌ ဤဝန်ထမ်း ID သည် စနစ်ထဲတွင် ရှိပြီးသားဖြစ်ပါသည်။ ID အသစ်တစ်ခု ပြောင်းထည့်ပါ။");
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
        alert("အချက်အလက်များနှင့် မျက်နှာစကန်ဒေတာ အားလုံးပြည့်စုံစွာ ဖြည့်သွင်းရပါမည်။"); 
        return; 
    }

    let query;
    if (isEditing) {
        query = await appSupabase.from('employees').update({ name: name, face_embedding: faceData }).eq('employee_id', empId);
    } else {
        query = await appSupabase.from('employees').insert([{ employee_id: empId, name: name, face_embedding: faceData }]);
    }

    if (query.error) { 
        alert("အမှားအယွင်းရှိပါသည်: " + query.error.message); 
    } else { 
        alert("ဝန်ထမ်းစာရင်းကို အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။"); 
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
                <td style="color:#10b981; font-weight:600;">✓ Ready</td>
                <td>
                    <button onclick="editEmployee('${emp.employee_id}', '${emp.name}', '${emp.face_embedding}')" class="btn-yellow" style="width:auto; padding:6px 12px; display:inline-block; font-size:0.85rem;">ပြင်မည်</button>
                    <button onclick="deleteEmployee('${emp.employee_id}')" class="btn-red" style="width:auto; padding:6px 12px; display:inline-block; font-size:0.85rem;">ဖျက်မည်</button>
                </td>
            </tr>`;
    });
}

function editEmployee(id, name, face) {
    document.getElementById('admin-emp-id').value = id;
    document.getElementById('admin-emp-id').disabled = true;
    document.getElementById('admin-emp-name').value = name;
    document.getElementById('admin-face-data').value = face;
    document.getElementById('face-status').innerText = "✓ Face Data: ထည့်သွင်းပြီးသား";
    document.getElementById('face-status').style.color = "#10b981";
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ရန်";
    isEditing = true;
}

async function deleteEmployee(empId) {
    if (confirm("ဤဝန်ထမ်းအား ဖျက်ပစ်ရန် သေချာပါသလား?")) {
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
    document.getElementById('face-status').innerText = "Face Data: မရှိသေးပါ";
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

            if (error) alert("မအောင်မြင်ပါ- " + error.message);
            else { alert("တက်ရောက်မှု မှတ်တမ်းတင်ပြီးပါပြီ။"); location.reload(); }
        });
    } else { alert("GPS တည်နေရာ ရှာမတွေ့ပါ။"); }
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
        
        // Google Maps String Syntax အမှားအား စနစ်တကျ ပြန်ပြင်ထားပါသည်
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
                    <p><b>ဝန်ထမ်း နာမည်:</b> <span style="color: #2563eb;">${props.empName}</span></p>
                    <p>ID: ${props.empId}</p>
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