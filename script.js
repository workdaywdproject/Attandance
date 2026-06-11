// ==========================================
// 🌐 SUPABASE DATABASE CONFIGURATION & CONNECTIVITY
// ==========================================
const SUPABASE_URL = "https://recgyevngygrfozfjpqn.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_M0rAOJuDodV286QzEiSe1w_6-nNdTq8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Database ချိတ်ဆက်မှု အခြေအနေအား နောက်ကွယ်မှ စမ်းသပ်ခြင်း
async function testDatabaseConnection() {
    try {
        const { data, error } = await supabaseClient.from('admin_settings').select('count', { count: 'exact', head: true });
        if (error) console.error("❌ Database Connection Error:", error.message);
        else console.log("✅ Supabase Database Connected Successfully.");
    } catch (err) {
        console.error("❌ Network or Config Error:", err);
    }
}
testDatabaseConnection();

// ==========================================
// 🌎 GLOBAL SYSTEM VARIABLES
// ==========================================
let faceMatcher = null;
let activeStream = null;
let recognizedEmployee = null;
let fullCalendarInstance = null;
let employeeToDeleteId = null;

// ==========================================
// 🚀 INITIALIZATION & MODEL LOADING
// ==========================================
async function loadFaceApiModels() {
    console.log("⚙️ Loading Face-API Models...");
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log("✅ All FaceModels Loaded Successfully.");
        await trainFaceMatcher();
    } catch (err) {
        console.error("❌ Failed to load Face-API Models:", err);
    }
}

// Database ထဲမှ ဝန်ထမ်းမျက်နှာများကို စနစ်ထဲသို့ မှတ်မိစေရန် သင်ကြားခြင်း
async function trainFaceMatcher() {
    try {
        const { data: employees, error } = await supabaseClient.from('employees').select('*');
        if (error) throw error;

        const labeledDescriptors = [];
        if (!employees || employees.length === 0) {
            console.warn("⚠️ No employee facial data found in database.");
            return;
        }

        employees.forEach(emp => {
            if (emp.face_data) {
                try {
                    const parsed = JSON.parse(emp.face_data);
                    const float32Array = new Float32Array(parsed);
                    const descriptor = [float32Array];
                    const label = `${emp.emp_id}||${emp.name}||${emp.position}`;
                    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label, descriptor));
                } catch (e) {
                    console.error(`❌ Data parse error for worker: ${emp.name}`, e);
                }
            }
        });

        if (labeledDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55); // Threshold = 55% Match
            console.log("✅ Face Matcher Database sync completed.");
        }
    } catch (err) {
        console.error("❌ Face training error:", err);
    }
}

// စာမျက်နှာတွင် ကင်မရာ Element ပါဝင်ပါက Model များကို တိုက်ရိုက်ဆွဲတင်ခြင်း
if (document.getElementById('video') || document.getElementById('admin-video')) {
    loadFaceApiModels();
}

// ==========================================
// 📸 SCANNING HANDLER FOR EMPLOYEES (index.html)
// ==========================================
async function openScanModal() {
    const modal = document.getElementById('scan-modal');
    const instruction = document.getElementById('instruction');
    const video = document.getElementById('video');

    modal.classList.remove('hidden');
    instruction.innerText = "ကင်မရာ စတင်ဖွင့်လှစ်နေပါသည်...";

    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480, facingMode: "user" } 
        });
        video.srcObject = activeStream;
        
        // ⚠️ နောက်ခံမည်းမနေစေရန် ကင်မရာ Stream ကျလာမှ Play လုပ်ပြီး မျက်နှာဖတ်စနစ်ကို စတင်စေခြင်း
        video.onloadedmetadata = () => {
            video.play();
            instruction.innerText = "မျက်နှာကို ဘောင်အတွင်းတည့်တည့် ထားပေးပါ...";
            startFaceRecognitionLoop();
        };
    } catch (err) {
        console.error("Camera Access Denied:", err);
        instruction.innerText = "❌ ကင်မရာဖွင့်၍မရပါ (Permission ပေးရန်လိုအပ်ပါသည်)";
    }
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.add('hidden');
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
}

// မျက်နှာဖတ်စစ်ဆေးခြင်း ကွင်းဆက် Loop
async function startFaceRecognitionLoop() {
    const video = document.getElementById('video');
    const instruction = document.getElementById('instruction');

    if (!video || video.paused || video.ended) return;

    try {
        const detection = await faceapi.detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection && faceMatcher) {
            const match = faceMatcher.findBestMatch(detection.descriptor);
            if (match && match.label !== 'unknown') {
                const [id, name, pos] = match.label.split('||');
                
                recognizedEmployee = { id, name, pos };
                document.getElementById('recognized-id').innerText = id;
                document.getElementById('recognized-name').innerText = name;
                document.getElementById('recognized-pos').innerText = pos;

                instruction.innerText = `✅ ကိုက်ညီမှုရှိပါသည် - ${name}`;

                setTimeout(() => {
                    closeScanModal();
                    document.getElementById('step-1').classList.add('hidden');
                    document.getElementById('step-2').classList.remove('hidden');
                }, 1000);
                return; 
            } else {
                instruction.innerText = "🔍 မျက်နှာကို ရှာဖွေမတွေ့ရှိသေးပါ...";
            }
        }
    } catch (err) {
        console.error("Recognition Error loop:", err);
    }

    setTimeout(startFaceRecognitionLoop, 500);
}

function showConfirmModal() {
    if (!recognizedEmployee) return;
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value.trim();

    document.getElementById('conf-id').innerText = recognizedEmployee.id;
    document.getElementById('conf-name').innerText = recognizedEmployee.name;
    document.getElementById('conf-pos').innerText = recognizedEmployee.pos;
    document.getElementById('conf-type').innerText = type === "IN" ? "Check-In (အလုပ်ဝင်)" : "Check-Out (အလုပ်ဆင်း)";
    document.getElementById('conf-remark').innerText = remark ? remark : "-";

    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }

// တက်ရောက်မှု ဒေတာဘေ့စ်ထဲသို့ သိမ်းဆည်းခြင်း
async function submitAttendance() {
    closeConfirmModal();
    const type = document.querySelector('input[name="attendance-type"]:checked').value;
    const remark = document.getElementById('remark').value.trim();

    const payload = {
        emp_id: recognizedEmployee.id,
        name: recognizedEmployee.name,
        position: recognizedEmployee.pos,
        type: type,
        remark: remark,
        timestamp: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('attendance').insert([payload]);
        if (error) throw error;

        const globalModal = document.getElementById('status-modal');
        const title = document.getElementById('status-title');
        title.style.color = "var(--success)";
        title.innerText = "အောင်မြင်ပါသည်";
        document.getElementById('status-message').innerText = `${recognizedEmployee.name} ၏ ${type} မှတ်တမ်းကို သိမ်းဆည်းပြီးပါပြီ။`;
        
        globalModal.classList.remove('hidden');
        
        setTimeout(() => {
            window.location.href = 'portal.html';
        }, 3000);

    } catch (err) {
        console.error("Database Insert Error:", err);
        alert("❌ မှတ်တမ်းတင်ရန် ဒေတာဘေ့စ်သို့ မချိတ်ဆက်နိုင်ပါ။");
    }
}

function closeStatusModal() {
    document.getElementById('status-modal').classList.add('hidden');
    window.location.href = 'portal.html';
}

// ==========================================
// 👑 ADMIN & DASHBOARD CONTROL ENGINE (admin.html)
// ==========================================
let adminFaceDescriptor = null;

function initDashboard() {
    loadEmployeeTable();
    initFullCalendar();
}

async function loadEmployeeTable() {
    const tbody = document.getElementById('employee-table-body');
    if (!tbody) return;

    try {
        const { data: employees, error } = await supabaseClient.from('employees').select('*');
        if (error) throw error;

        tbody.innerHTML = "";
        if (!employees || employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">စနစ်အတွင်း ဝန်ထမ်းစာရင်း မရှိသေးပါ။</td></tr>`;
            return;
        }

        employees.forEach(emp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${emp.emp_id}</b></td>
                <td>${emp.name}</td>
                <td>${emp.position}</td>
                <td>
                    <button onclick="confirmDeleteEmployee('${emp.id}')" class="btn-red" style="width:auto; padding:6px 12px; font-size:0.75rem;">ပယ်ဖျက်</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Load Workers Matrix Error:", err);
    }
}

function confirmDeleteEmployee(dbId) {
    employeeToDeleteId = dbId;
    document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); }

document.getElementById('delete-confirm-btn')?.addEventListener('click', async () => {
    if (!employeeToDeleteId) return;
    try {
        const { error } = await supabaseClient.from('employees').delete().eq('id', employeeToDeleteId);
        if (error) throw error;
        closeDeleteModal();
        loadEmployeeTable();
        trainFaceMatcher();
    } catch (err) {
        console.error(err);
    }
});

async function checkDuplicateID() {
    const empId = document.getElementById('admin-emp-id').value.trim();
    const btnSave = document.getElementById('btn-save');
    if (!empId) return;

    const { data } = await supabaseClient.from('employees').select('emp_id').eq('emp_id', empId);
    if (data && data.length > 0) {
        document.getElementById('face-status').innerText = "⚠️ ဤဝန်ထမ်းကုဒ်မှာ စနစ်ထဲတွင် ရှိနှင့်ပြီးသားဖြစ်သည်!";
        document.getElementById('face-status').style.color = "var(--danger)";
        btnSave.disabled = true;
    } else {
        document.getElementById('face-status').innerText = adminFaceDescriptor ? "✅ ဇီဝအချက်အလက် အဆင်သင့်ရှိပါသည်" : "ဇီဝအချက်အလက် မရှိသေးပါ";
        document.getElementById('face-status').style.color = adminFaceDescriptor ? "var(--success)" : "var(--danger)";
        btnSave.disabled = false;
    }
}

async function openAdminScanModal() {
    const modal = document.getElementById('admin-scan-modal');
    const instr = document.getElementById('admin-instruction');
    const video = document.getElementById('admin-video');

    modal.classList.remove('hidden');
    instr.innerText = "ကင်မရာ စတင်နေပါသည်...";
    try {
        activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = activeStream;
        video.onloadedmetadata = () => {
            video.play();
            instr.innerText = "စနစ်မှ မျက်နှာကို မှတ်တမ်းယူနေပါသည်၊ ငြိမ်ငြိမ်နေပေးပါ...";
            captureAdminFace();
        };
    } catch (err) {
        instr.innerText = "❌ ကင်မရာဖွင့်၍မရပါ";
    }
}

async function captureAdminFace() {
    const video = document.getElementById('admin-video');
    const instr = document.getElementById('admin-instruction');

    if (!video || video.paused) return;

    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
            adminFaceDescriptor = Array.from(detection.descriptor);
            document.getElementById('admin-face-data').value = JSON.stringify(adminFaceDescriptor);
            
            document.getElementById('face-status').innerText = "✅ ဇီဝအချက်အလက် အဆင်သင့်ရှိပါသည်";
            document.getElementById('face-status').style.color = "var(--success)";
            
            instr.innerText = "✅ မျက်နှာမှတ်တမ်း ရယူခြင်း အောင်မြင်ပါသည်။";
            setTimeout(closeAdminScanModal, 1200);
        } else {
            setTimeout(captureAdminFace, 400);
        }
    } catch (err) {
        console.error(err);
    }
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

    if (!empId || !name || !pos || !faceData) {
        alert("⚠️ ဝန်ထမ်းအချက်အလက်များနှင့် ဇီဝဒေတာများ ပြည့်စုံစွာ ဖြည့်စွက်ပါ!");
        return;
    }

    try {
        const { error } = await supabaseClient.from('employees').insert([{
            emp_id: empId, name: name, position: pos, face_data: faceData
        }]);

        if (error) throw error;
        alert("✅ ဝန်ထမ်းသစ် သိမ်းဆည်းခြင်း အောင်မြင်ပါသည်။");
        resetAdminForm();
        loadEmployeeTable();
        trainFaceMatcher();
    } catch (err) {
        console.error(err);
    }
}

function resetAdminForm() {
    document.getElementById('admin-emp-id').value = "";
    document.getElementById('admin-emp-name').value = "";
    document.getElementById('admin-emp-pos').value = "";
    document.getElementById('admin-face-data').value = "";
    adminFaceDescriptor = null;
    document.getElementById('face-status').innerText = "ဇီဝအချက်အလက် မရှိသေးပါ";
    document.getElementById('face-status').style.color = "var(--danger)";
}

async function initFullCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    fullCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
        selectable: true,
        events: async function(info, successCallback, failureCallback) {
            try {
                const { data: logs, error } = await supabaseClient.from('attendance').select('*');
                if (error) throw error;

                const counts = {};
                logs.forEach(log => {
                    const dateStr = log.timestamp.split('T')[0];
                    counts[dateStr] = (counts[dateStr] || 0) + 1;
                });

                const eventsList = Object.keys(counts).map(dateKey => ({
                    title: `🪵 Record: ${counts[dateKey]} ခု`,
                    start: dateKey,
                    allDay: true,
                    extendedProps: { rawDate: dateKey }
                }));

                successCallback(eventsList);
            } catch (err) {
                failureCallback(err);
            }
        },
        dateClick: function(info) { fetchAttendanceDetailsByDate(info.dateStr); },
        eventClick: function(info) { fetchAttendanceDetailsByDate(info.event.extendedProps.rawDate); }
    });

    fullCalendarInstance.render();
}

async function fetchAttendanceDetailsByDate(dateStr) {
    const detailBox = document.getElementById('attendance-details');
    document.getElementById('selected-date-title').innerText = `မှတ်တမ်းအသေးစိတ် (${dateStr})`;

    try {
        const { data: records, error } = await supabaseClient
            .from('attendance')
            .select('*')
            .gte('timestamp', `${dateStr}T00:00:00.000Z`)
            .lte('timestamp', `${dateStr}T23:59:59.999Z`);

        if (error) throw error;

        detailBox.innerHTML = "";
        if (!records || records.length === 0) {
            detailBox.innerHTML = `<p style="color:var(--text-muted); text-align:center; font-size:0.85rem;">ဤနေ့အတွက် မှတ်တမ်းမရှိပါ။</p>`;
            return;
        }

        records.forEach(rec => {
            const time = new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('div');
            item.className = "detail-box";
            item.style.borderLeftColor = rec.type === "IN" ? "var(--success)" : "var(--danger)";
            item.innerHTML = `
                <div class="detail-text">
                    <p><b>[${time}] - ${rec.name}</b> (${rec.position})</p>
                    <p style="font-size:0.8rem; margin-top:3px;">
                        အမျိုးအစား: <span style="color:${rec.type === "IN" ? "var(--success)" : "var(--danger)"}; font-weight:700;">${rec.type}</span> 
                        | ID: ${rec.emp_id}
                    </p>
                    ${rec.remark ? `<p style="font-size:0.75rem; color:var(--text-muted);">📝 မှတ်ချက်: ${rec.remark}</p>` : ''}
                </div>
            `;
            detailBox.appendChild(item);
        });
    } catch (err) {
        console.error(err);
    }
}

async function updateAdminAccount() {
    const user = document.getElementById('update-admin-user').value.trim();
    const pass = document.getElementById('update-admin-pass').value.trim();

    if (!user || pass.length < 6) {
        alert("⚠️ အချက်အလက်များမှန်ကန်စွာဖြည့်ပါ (စကားဝှက်သည် အနည်းဆုံး ၆ လုံးရှိရမည်)");
        return;
    }

    try {
        const { data: existing } = await supabaseClient.from('admin_settings').select('id').limit(1).single();
        if (existing) {
            const { error } = await supabaseClient.from('admin_settings').update({ username: user, password: pass }).eq('id', existing.id);
            if (error) throw error;
            alert("✅ Admin အကောင့် ပြောင်းလဲခြင်း အောင်မြင်ပါသည်။");
            if(typeof handleLogout === "function") handleLogout();
        }
    } catch (err) {
        console.error(err);
    }
}

async function createNewAdminAccount() {
    const user = document.getElementById('new-admin-user').value.trim();
    const pass = document.getElementById('new-admin-pass').value.trim();

    if (!user || !pass) {
        alert("⚠️ အချက်အလက် ဖြည့်စွက်ပေးရန်လိုအပ်ပါသည်။");
        return;
    }

    try {
        const { error } = await supabaseClient.from('admin_settings').insert([{ username: user, password: pass }]);
        if (error) throw error;
        alert("✅ Admin အသစ် ထည့်သွင်းခြင်း အောင်မြင်ပါသည်။");
        document.getElementById('new-admin-user').value = "";
        document.getElementById('new-admin-pass').value = "";
    } catch (err) {
        console.error(err);
    }
}