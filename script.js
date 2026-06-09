// ==================== ၁။ SUPABASE CLIENT SETUP ====================
const SUPABASE_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";


// 'supabase' နာမည်ငြိစွန်းမှုမရှိစေရန် Global ကွဲပြားအောင် သတ်မှတ်ခြင်း
const mySupabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


async function loadModels() {
    try {
        // Admin ရော User ပါ သုံးနိုင်အောင် Model (၃) ခုလုံး စုံလင်စွာ Load လုပ်ပါမည်
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models'); // မျက်နှာအနားသတ်များ သိနိုင်ရန်
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        console.log("AI Face Models Loaded Successfully!");
    } catch (e) {
        console.error("Models loading error: ", e);
    }
}
loadModels();


// ==================== ၃။ ADMIN OPERATIONS (ID စစ်ဆေးခြင်းနှင့် မျက်နှာမှတ်ပုံတင်ခြင်း) ====================

// က။ ဝန်ထမ်း ID အဟောင်းထဲမှာ ရှိမရှိ တိုက်စစ်ခြင်း
async function checkDuplicateID() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    if (!empId) return;

    const { data, error } = await mySupabaseClient
        .from('employees')
        .select('employee_id')
        .eq('employee_id', empId);

    if (error) {
        console.error(error);
        return;
    }

    const btnSave = document.getElementById('btn-save');

    if (data.length > 0 && !isEditing) {
        alert("❌ ဤဝန်ထမ်း ID သည် စနစ်ထဲတွင် ရှိပြီးသားဖြစ်ပါသည်။ ကျေးဇူးပြု၍ ID အသစ်ပြောင်းထည့်ပါ။");
        document.getElementById('admin-emp-id').style.borderColor = "#ef4444";
        btnSave.disabled = true; // စာရင်းသိမ်းခွင့် ပိတ်ထားမည်
        btnSave.style.opacity = "0.5";
    } else {
        document.getElementById('admin-emp-id').style.borderColor = "#10b981";
        btnSave.disabled = false; // စာရင်းသိမ်းခွင့် ပြန်ဖွင့်မည်
        btnSave.style.opacity = "1";
    }
}

// ခ။ စာရင်းသွင်းစဉ် ကင်မရာဖွင့်ပြီး မျက်နှာ Data အစစ် (Vector Embedding) ယူခြင်း
async function registerFaceScan() {
    const camBox = document.getElementById('admin-cam-box');
    const video = document.getElementById('admin-video');
    
    camBox.classList.remove('hidden');

    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
            
            // ကင်မရာပွင့်သွားပြီးနောက် ၁ စက္ကန့်လျှင် တစ်ကြိမ်နှုန်းဖြင့် မျက်နှaကို ထောက်လှမ်းစစ်ဆေးမည်
            const interval = setInterval(async () => {
                // မျက်နှာရှိ Landmarks များနှင့် Descriptors များကို အပြည့်အစုံ ဆွဲထုတ်ခြင်း
                const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                             .withFaceLandmarks()
                                             .withFaceDescriptor();
                
                if (detection) {
                    // မျက်နှာအစစ်၏ 128 Float Vector array အား ရရှိပြီဖြစ်သည်
                    const faceDescriptor = detection.descriptor;
                    
                    // Array Data အား Database တွင် သိမ်းဆည်းရန်အတွက် JSON String အဖြစ် ပြောင်းလဲသိမ်းဆည်းခြင်း
                    document.getElementById('admin-face-data').value = JSON.stringify(Array.from(faceDescriptor));
                    
                    // အခြေအနေအား လှပအောင် ပြောင်းလဲပြသခြင်း
                    const statusText = document.getElementById('face-status');
                    statusText.innerText = "✓ Face Data: ရရှိပါပြီ (အဆင်သင့်ဖြစ်သည်)";
                    statusText.style.color = "#10b981";
                    
                    // ကင်မရာပြန်ပိတ်ပြီး Interval ကို ရပ်တန့်ခြင်း
                    clearInterval(interval);
                    let tracks = stream.getTracks();
                    tracks.forEach(track => track.stop());
                    camBox.classList.add('hidden');
                    alert("✓ ဝန်ထမ်း၏ မျက်နှာပုံစံအား အောင်မြင်စွာ မှတ်တမ်းတင်ပြီးပါပြီ။");
                }
            }, 1000);
        })
        .catch(err => {
            alert("ကင်မရာ ဖွင့်၍မရပါ သို့မဟုတ် ခွင့်ပြုချက်မပေးထားပါ။");
        });
}

let isEditing = false; 

// ဂ။ ဒေတာများကို Database ထဲသို့ သိမ်းဆည်းခြင်း
async function saveEmployee() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const name = document.getElementById('admin-emp-name').value.trim();
    const faceData = document.getElementById('admin-face-data').value;

    if (!empId || !name) {
        alert("ID နှင့် နာမည်ကို ပြည့်စုံစွာ ဖြည့်ပါ");
        return;
    }

    if (!faceData) {
        alert("⚠️ ဝန်ထမ်း၏ မျက်နှာ (Face Scan) အား အရင်ဖတ်ပေးရန် လိုအပ်ပါသည်!");
        return;
    }

    if (isEditing) {
        const { error } = await mySupabaseClient
            .from('employees')
            .update({ name: name, face_embedding: faceData })
            .eq('employee_id', empId);

        if (error) {
            alert("ပြင်ဆင်ရာတွင် အမှားအယွင်းရှိသည်- " + error.message);
        } else {
            alert("ဝန်ထမ်းအချက်အလက်ကို ပြင်ဆင်ပြီးပါပြီ။");
            resetAdminForm();
        }
    } else {
        const { error } = await mySupabaseClient
            .from('employees')
            .insert([{ employee_id: empId, name: name, face_embedding: faceData }]);

        if (error) {
            alert("စာရင်းသွင်းရာတွင် အမှားအယွင်းရှိသည်- " + error.message);
        } else {
            alert("ဝန်ထမ်းအသစ်ကို စာရင်းသွင်းပြီးပါပြီ။");
            resetAdminForm();
        }
    }
    fetchEmployees(); 
}

// ဃ။ ဝန်ထမ်းစာရင်းများအားလုံးကို ဆွဲထုတ်ပြသခြင်း
async function fetchEmployees() {
    const { data: employees, error } = await mySupabaseClient
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return;

    const tableBody = document.getElementById('employee-table-body');
    tableBody.innerHTML = ""; 

    employees.forEach(emp => {
        const hasFace = emp.face_embedding ? "✓ Registered" : "❌ No Face Data";
        const row = `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 border">${emp.employee_id}</td>
                <td class="p-3 border">${emp.name}</td>
                <td class="p-3 border text-green font-semibold">${hasFace}</td>
                <td class="p-3 border space-x-2">
                    <button onclick="editEmployee('${emp.employee_id}', '${emp.name}', '${emp.face_embedding}')" class="bg-yellow-500 text-white btn-sm btn-yellow cursor-pointer">ပြင်မည်</button>
                    <button onclick="deleteEmployee('${emp.employee_id}')" class="bg-red-500 text-white btn-sm btn-red cursor-pointer">ဖျက်မည်</button>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

// င။ ပြင်ဆင်ရန် အဆင့်
function editEmployee(id, name, faceEmbedding) {
    document.getElementById('admin-emp-id').value = id;
    document.getElementById('admin-emp-id').disabled = true; 
    document.getElementById('admin-emp-id').style.borderColor = "#d1d5db";
    document.getElementById('admin-emp-name').value = name;
    document.getElementById('admin-face-data').value = faceEmbedding;
    
    const statusText = document.getElementById('face-status');
    statusText.innerText = "✓ Face Data: ရှိပြီးသား (ပြင်လိုပါက Scan ထပ်ဖတ်နိုင်သည်)";
    statusText.style.color = "#10b981";

    document.getElementById('form-title').innerText = "ဝန်ထမ်းအချက်အလက် ပြင်ဆင်ရန်";
    document.getElementById('btn-save').innerText = "အပြောင်းအလဲ သိမ်းမည်";
    document.getElementById('btn-save').disabled = false;
    document.getElementById('btn-save').style.opacity = "1";
    isEditing = true;
}

// စ။ ဝန်ထမ်းအား ဖြုတ်ချ/ဖျက်ပစ်ခြင်း
async function deleteEmployee(empId) {
    if (confirm("ဤဝန်ထမ်းကို ဖျက်ပစ်ရန် သေချာပါသလား?")) {
        await mySupabaseClient.from('employees').delete().eq('employee_id', empId);
        fetchEmployees();
    }
}

function resetAdminForm() {
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-id').disabled = false;
    document.getElementById('admin-emp-id').style.borderColor = "#d1d5db";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-face-data').value = "";
    document.getElementById('face-status').innerText = "Face Data: မရှိသေးပါ";
    document.getElementById('face-status').style.color = "#ef4444";
    document.getElementById('form-title').innerText = "ဝန်ထမ်းအသစ် စာရင်းသွင်းရန်";
    document.getElementById('btn-save').innerText = "စာရင်းသိမ်းမည်";
    isEditing = false;
}


// ==================== ၄။ ATTENDANCE (INDEX) OPERATIONS ====================
async function startFaceScan() {
    const id = document.getElementById('emp-id').value;
    const name = document.getElementById('emp-name').value;

    if(!id || !name) {
        alert("ID နှင့် နာမည်ကို အရင်ဖြည့်စွက်ပါ!");
        return;
    }

    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');

    const video = document.getElementById('video');
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
            setTimeout(() => { detectFace(); }, 3000);
        })
        .catch(err => alert("ကင်မရာ ဖွင့်၍မရပါ။"));
}

async function detectFace() {
    const video = document.getElementById('video');
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
    
    if (detection) {
        document.getElementById('step-2').classList.add('hidden');
        document.getElementById('step-3').classList.remove('hidden');
        
        let stream = video.srcObject;
        let tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
    } else {
        alert("မျက်နှာ စစ်ဆေး၍မရပါ။ ထပ်မံကြိုးစားပေးပါ။");
        location.reload();
    }
}

function submitAttendance() {
    const id = document.getElementById('emp-id').value;
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            const { error } = await mySupabaseClient
                .from('attendance_logs')
                .insert([{ employee_id: id, type: type, latitude: lat, longitude: lng, remark: remark }]);

            if (error) {
                alert("ဒေတာသိမ်းဆည်းရာတွင် အမှားအယွင်းရှိပါသည်- " + error.message);
            } else {
                alert("အောင်မြင်စွာ တက်ရောက်မှု မှတ်တမ်းတင်ပြီးပါပြီ။");
                location.reload();
            }
        });
    } else {
        alert("သင့် Browser သည် Geolocation စနစ်ကို အထောက်အပံ့မပြုပါ။");
    }
}


// ==================== ၅။ DASHBOARD & CALENDAR OPERATIONS ====================
async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;

    const { data: logs, error } = await mySupabaseClient
        .from('attendance_logs')
        .select(`*, employees ( name )`);

    if (error) return;

    const calendarEvents = logs.map(log => {
        const empName = log.employees ? log.employees.name : "Unknown";
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return {
            title: `${empName} (${log.type})`, 
            start: log.timestamp.split('T')[0], 
            extendedProps: {
                empId: log.employee_id,
                empName: empName,
                type: log.type === 'IN' ? 'အဝင် (Check-In)' : 'အထွက် (Check-Out)',
                time: timeStr,
                remark: log.remark || "မှတ်ချက်မရှိပါ",
                location: `Lat: ${log.latitude.toFixed(4)}, Lng: ${log.longitude.toFixed(4)}`,
                mapsLink: `http://maps.google.com/?q=${log.latitude},${log.longitude}`
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
                </div>
            `;
        }
    });
    calendar.render();
}