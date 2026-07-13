const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

let employeeRows = [];

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("service-worker.js").catch(() => {})
  );
}

function $(id) {
  return document.getElementById(id);
}

window.addEventListener("DOMContentLoaded", () => {
  const pw = $("password");
  if (pw) pw.value = "";
});

function getVal(r, keys) {
  for (const k of keys) {
    if (r && r[k] !== undefined && r[k] !== null && r[k] !== "") {
      return r[k];
    }
  }
  return "-";
}

function show(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

function showTab(tab){

  document.getElementById("applyTab").classList.add("hidden");
  document.getElementById("registerTab").classList.add("hidden");
  document.getElementById("historyTab").classList.add("hidden");
  document.getElementById("compTab").classList.add("hidden");

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.remove("active");
  });

  if(tab === "apply"){
    document.getElementById("applyTab").classList.remove("hidden");
    document.querySelectorAll(".tab")[0].classList.add("active");
  }

  if(tab === "register"){
    document.getElementById("registerTab").classList.remove("hidden");
    document.querySelectorAll(".tab")[1].classList.add("active");
  }

  if(tab === "history"){
    document.getElementById("historyTab").classList.remove("hidden");
    document.querySelectorAll(".tab")[2].classList.add("active");
  }

  if(tab === "comp"){
    document.getElementById("compTab").classList.remove("hidden");
    document.querySelectorAll(".tab")[3].classList.add("active");
  }
}

function syncRegisterFields() {
  if ($("regName") && $("name")) $("regName").value = $("name").value.trim();
  if ($("regPhone") && $("phone")) $("regPhone").value = $("phone").value.trim();
}

async function postNoCors(data) {
  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(data)
  });
}

function jsonp(params) {
  return new Promise((resolve, reject) => {
    const callback = "cb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    window[callback] = data => {
      resolve(data);
      delete window[callback];
      script.remove();
    };

    const query = new URLSearchParams({
      ...params,
      callback
    });

    const script = document.createElement("script");
    script.src = SCRIPT_URL + "?" + query.toString();
    script.onerror = () => reject(new Error("불러오기 실패"));

    document.body.appendChild(script);
  });
}

async function registerEmployee() {
  const btn = document.querySelector("#registerTab .primary");

  const data = {
    action: "register",
    store: $("regStore").value,
    name: $("regName").value.trim(),
    phone: $("regPhone").value.trim(),
    hireDate: $("hireDate").value
  };

  if (!data.name) return show("registerResult", "이름을 입력하세요.");
  if (!data.phone) return show("registerResult", "연락처를 입력하세요.");
  if (!data.hireDate) return show("registerResult", "입사일을 선택하세요.");

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "등록중...";
    }

    await postNoCors(data);

    show("registerResult", "직원 등록/수정이 완료되었습니다.");

    if ($("name")) $("name").value = data.name;
    if ($("phone")) $("phone").value = data.phone;
    if ($("store")) $("store").value = data.store;

  } catch (e) {
    show("registerResult", "등록 중 오류가 발생했습니다.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "직원 등록 / 수정";
    }
  }
}

async function submitLeave() {
  const btn = document.querySelector("#applyTab .primary");

  const data = {
    action: "apply",
    store: $("store").value,
    name: $("name").value.trim(),
    phone: $("phone").value.trim(),
    leaveType: $("leaveType").value,
    startDate: $("startDate").value,
    endDate: $("endDate").value,
    days: Number($("days").value),
    reason: $("reason").value.trim()
  };

  if (!data.name || !data.phone || !data.leaveType || !data.startDate || !data.endDate || !data.days) {
    return show("result", "필수 항목을 확인하세요.");
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "신청중...";
    }

    show("result", "신청을 접수하고 있습니다...");

    const res = await jsonp(data);

    if (!res.ok) throw new Error(res.message || "신청 실패");

    show("result", "신청이 접수되었습니다. 관리자 승인 후 반영됩니다.");

    ["leaveType", "startDate", "endDate", "days", "reason"].forEach(id => {
      if ($(id)) $(id).value = "";
    });

  } catch (e) {
    show("result", e.message || "전송 중 오류가 발생했습니다.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "신청하기";
    }
  }
}

async function checkBalance() {
  const btn = document.querySelector(".secondary");
  const oldText = btn ? btn.textContent : "";

  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const box = $("balanceBox");

  if (!name || !phone) {
    return show("result", "이름과 연락처를 입력한 뒤 조회하세요.");
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "조회중...";
    }

    const data = await jsonp({ action: "balance", name, phone });

    if (!data.ok) return show("result", data.message || "조회 실패");

    const b = data.balance;

    if (!b.registered) {
      box.innerHTML = "직원 등록 정보가 없습니다.<br>직원등록 탭에서 입사일을 먼저 등록하세요.";
      box.classList.add("show");
      syncRegisterFields();
      return;
    }

    box.innerHTML =
      `입사일: ${b.hireDate}<br>
       근속기간: ${b.workYears}년 ${b.workMonths}개월<br>
       발생 연월차: ${b.base}일<br>
       승인 사용: ${b.used}일<br>
       승인대기: ${b.pending}일<br>
       현재 잔여: ${b.remain}일`;

    box.classList.add("show");

  } catch (e) {
    show("result", "잔여 연월차 조회 중 오류가 발생했습니다.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || "잔여 연월차 확인";
    }
  }
}

async function loadMyRequests() {
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const list = $("myList");

  if (!name || !phone) {
    return show("result", "이름과 연락처를 입력한 뒤 조회하세요.");
  }

  list.innerHTML = "";

  try {
    const data = await jsonp({
      action: "my",
      name,
      phone
    });

    if (!data.ok) {
      list.innerHTML = `<div class="item">${data.message || "조회 실패"}</div>`;
      return;
    }

    if (!data.rows.length) {
      list.innerHTML = `<div class="item">신청 내역이 없습니다.</div>`;
      return;
    }

    list.innerHTML = data.rows.map(renderItem).join("");

  } catch (e) {
    list.innerHTML = `<div class="item">조회 중 오류가 발생했습니다.</div>`;
  }
}

function statusBadge(s) {
  if (s === "승인" || s === "승인완료") {
    return `<span class="badge ok">승인완료</span>`;
  }

  if (s === "반려") {
    return `<span class="badge no">반려</span>`;
  }

  return `<span class="badge wait">대기</span>`;
}

function renderItem(r) {
  const name = getVal(r, ["직원명", "이름", "name"]);
  const leaveType = getVal(r, ["휴가구분", "휴가종류", "leaveType"]);
  const status = getVal(r, ["상태", "status"]);
  const startDate = getVal(r, ["시작일", "startDate"]);
  const endDate = getVal(r, ["종료일", "endDate"]);
  const days = getVal(r, ["일수", "사용일수", "days"]);
  const reason = getVal(r, ["사유", "reason"]);
  const memo = getVal(r, ["관리자메모", "adminMemo"]);

  return `
    <div class="item">
      <div class="item-title">
        ${leaveType} ${statusBadge(status)}
      </div>

      <div class="item-meta">
        신청자: ${name}<br>
        기간: ${startDate} ~ ${endDate}<br>
        사용일수: ${days}일<br>
        사유: ${reason}<br>
        관리자메모: ${memo}
      </div>
    </div>
  `;
}

async function loadAdminList() {
  const password = $("password").value.trim();
  const list = $("adminList");
  const result = $("adminResult");

  if (!password) {
    return show("adminResult", "관리자 비밀번호를 입력하세요.");
  }

  list.innerHTML = "신청 목록을 불러오는 중입니다...";

  try {
    const data = await jsonp({
      action: "list",
      password
    });

    if (!data.ok) {
      show("adminResult", data.message || "조회 실패");
      return;
    }

    result.classList.remove("show");

    if (!data.rows.length) {
      list.innerHTML = `<div class="item">신청 내역이 없습니다.</div>`;
      return;
    }

   const pendingRows = data.rows.filter(r => {
  const status = getVal(r, ["상태", "status"]);
  return status === "대기";
});

if (!pendingRows.length) {
  list.innerHTML = `<div class="item">승인 대기 신청이 없습니다.</div>`;
  return;
}

list.innerHTML = pendingRows.map(renderAdminItem).join("");

  } catch (e) {
    show("adminResult", "신청 목록 조회 중 오류가 발생했습니다.");
  }
}

function renderAdminItem(r) {
  const id = getVal(r, ["신청ID", "ID", "id"]);

  const store = getVal(r, ["소속", "매장", "store", "branch", "dept"]);
  const name = getVal(r, ["직원명", "이름", "name", "employeeName", "staffName"]);
  const phone = getVal(r, ["휴대폰", "연락처", "phone", "mobile"]);
  const leaveType = getVal(r, ["휴가구분", "휴가종류", "leaveType", "type"]);
  const startDate = getVal(r, ["시작일", "startDate"]);
  const endDate = getVal(r, ["종료일", "endDate"]);
  const days = getVal(r, ["일수", "사용일수", "days"]);
  const reason = getVal(r, ["사유", "reason"]);
  const status = getVal(r, ["상태", "status"]);
  const createdAt = getVal(r, ["신청일", "신청일시", "createdAt"]);
  const memo = getVal(r, ["관리자메모", "adminMemo"]);

  const disabled = status !== "대기" ? "style='display:none'" : "";

  return `
    <div class="item">
      <div class="item-title">
        ${name} / ${leaveType} ${statusBadge(status)}
      </div>

      <div class="item-meta">
        매장: ${store}<br>
        연락처: ${phone}<br>
        기간: ${startDate} ~ ${endDate}<br>
        사용일수: ${days}일<br>
        사유: ${reason}<br>
        신청일시: ${createdAt}<br>
        관리자메모: ${memo}
      </div>

      <div class="admin-actions" ${disabled}>
        <button class="primary" onclick="processRequest('${id}','approve')">승인</button>
        <button class="reject" onclick="processRequest('${id}','reject')">반려</button>
      </div>
    </div>
  `;
}

async function processRequest(id, action) {
  const password = $("password").value.trim();

  if (!id || id === "-") {
    return show("adminResult", "신청 ID가 없습니다.");
  }

  const memo =
    prompt(
      action === "approve"
        ? "승인 메모를 입력하세요."
        : "반려 사유를 입력하세요."
    ) || "";

  try {
    show("adminResult", "처리 중입니다...");

    await postNoCors({
      action,
      id,
      password,
      adminMemo: memo
    });

    show("adminResult", "처리되었습니다. 잠시 후 목록을 다시 불러옵니다.");

    setTimeout(loadAdminList, 1200);

  } catch (e) {
    show("adminResult", "처리 중 오류가 발생했습니다.");
  }
}

/* =========================
   연월차 일수 자동 계산
========================= */

function calculateDays() {

  const start = $("startDate").value;
  const end = $("endDate").value;
  const type = $("leaveType").value;

  if (!start || !end) return;

  if (
    type === "오전 반차" ||
    type === "오후 반차" ||
    type === "반차"
  ) {
    $("days").value = 0.5;
    return;
  }

  const s = new Date(start);
  const e = new Date(end);

  const diff =
    Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;

  $("days").value = diff > 0 ? diff : 1;
}

["startDate", "endDate", "leaveType"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", calculateDays);
});
async function checkCompBalance(){

  const store = $("compStore").value;
  const name = $("compName").value.trim();
  const phone = $("compPhone").value.trim();
  const box = $("compBalanceBox");

  if(!name || !phone){
    alert("이름과 연락처를 입력해주세요.");
    return;
  }

  box.innerHTML = "조회 중...";
  box.classList.add("show");

  try{
    const res = await jsonp({
      action: "compBalance",
      store,
      name,
      phone
    });

    if(!res.ok){
      box.innerHTML = res.message || "잔여 미휴무를 조회하지 못했습니다.";
      return;
    }

    box.innerHTML =
      `발생 미휴무: ${res.earned || 0}일<br>
       사용 미휴무: ${res.used || 0}일<br>
       잔여 미휴무: ${res.balance || 0}일`;

  }catch(e){
    box.innerHTML = "조회 오류가 발생했습니다.";
  }
}

async function submitExtraWork(){

  const btn = document.querySelector("button[onclick='submitExtraWork()']");

  const data = {
    action: "extraWork",
    store: $("compStore").value,
    name: $("compName").value.trim(),
    phone: $("compPhone").value.trim(),
    workDate: $("extraWorkDate").value,
    days: $("extraDays").value,
    reason: $("extraReason").value.trim()
  };

  if(!data.name || !data.phone || !data.workDate || !data.days){
    alert("이름, 연락처, 추가근무일, 발생일수를 입력해주세요.");
    return;
  }

  $("extraResult").innerHTML = "추가근무 등록 처리 중입니다...";

  try{
    if(btn){
      btn.disabled = true;
      btn.textContent = "등록 처리중...";
      btn.style.opacity = "0.7";
    }

    const res = await jsonp(data);

    if(!res.ok){
      $("extraResult").innerHTML = res.message || "추가근무 등록에 실패했습니다.";
      return;
    }

    $("extraResult").innerHTML = "추가근무가 승인대기로 등록되었습니다.";
    checkCompBalance();

  }catch(e){
    $("extraResult").innerHTML = "등록 오류가 발생했습니다.";
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = "추가근무 등록";
      btn.style.opacity = "1";
    }
  }
}

async function submitCompUse(){

  const btn = document.querySelector("button[onclick='submitCompUse()']");

  const data = {
    action: "compUse",
    store: $("compStore").value,
    name: $("compName").value.trim(),
    phone: $("compPhone").value.trim(),
    useDate: $("compUseDate").value,
    days: $("compUseDays").value,
    reason: $("compUseReason").value.trim()
  };

  if(!data.name || !data.phone || !data.useDate || !data.days){
    alert("이름, 연락처, 사용일, 사용일수를 입력해주세요.");
    return;
  }

  $("compUseResult").innerHTML = "미휴무 사용신청 처리 중입니다...";

  try{
    if(btn){
      btn.disabled = true;
      btn.textContent = "신청 처리중...";
      btn.style.opacity = "0.7";
    }

    const res = await jsonp(data);

    if(!res.ok){
      $("compUseResult").innerHTML = res.message || "미휴무 사용신청에 실패했습니다.";
      return;
    }

    $("compUseResult").innerHTML = "미휴무 사용신청이 승인대기로 접수되었습니다.";
    checkCompBalance();

  }catch(e){
    $("compUseResult").innerHTML = "신청 오류가 발생했습니다.";
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = "미휴무 사용신청";
      btn.style.opacity = "1";
    }
  }
}

async function loadCompAdminList() {
  const password = $("password").value.trim();
  const list = $("adminList");

  if (!password) {
    return show("adminResult", "관리자 비밀번호를 입력하세요.");
  }

  list.innerHTML = "미휴무 신청 목록을 불러오는 중입니다...";

  try {
    const data = await jsonp({
      action: "compList",
      password
    });

    if (!data.ok) {
      show("adminResult", data.message || "조회 실패");
      return;
    }

    const pendingRows = data.rows.filter(r => {
      const status = getVal(r, ["상태", "status"]);
      return status === "대기";
    });

    if (!pendingRows.length) {
      list.innerHTML = `<div class="item">승인 대기 미휴무 신청이 없습니다.</div>`;
      return;
    }

    list.innerHTML = pendingRows.map(renderCompAdminItem).join("");

  } catch (e) {
    show("adminResult", "미휴무 신청 목록 조회 중 오류가 발생했습니다.");
  }
}
function renderCompAdminItem(r) {
  const rowNo = getVal(r, ["rowNo"]);
  const type = getVal(r, ["구분"]);
  const store = getVal(r, ["매장"]);
  const name = getVal(r, ["이름"]);
  const phone = getVal(r, ["연락처"]);
  const workDate = getVal(r, ["발생일"]);
  const useDate = getVal(r, ["사용일"]);
  const days = getVal(r, ["일수"]);
  const reason = getVal(r, ["사유"]);
  const status = getVal(r, ["상태"]);

  const dateText = type === "발생" ? workDate : useDate;
  const title = type === "발생" ? "추가근무 발생 승인" : "미휴무 사용 승인";

  return `
    <div class="item">
      <div class="item-title">
        ${name} / ${title} ${statusBadge(status)}
      </div>

      <div class="item-meta">
        매장: ${store}<br>
        연락처: ${phone}<br>
        구분: ${type}<br>
        날짜: ${dateText}<br>
        일수: ${days}일<br>
        사유: ${reason}
      </div>

      <div class="admin-actions">
        <button class="primary" onclick="processCompRequest('${rowNo}','approve')">승인</button>
        <button class="reject" onclick="processCompRequest('${rowNo}','reject')">반려</button>
      </div>
    </div>
  `;
}
async function processCompRequest(rowNo, processType) {
  const password = $("password").value.trim();

  if (!rowNo || rowNo === "-") {
    return show("adminResult", "처리할 행 번호가 없습니다.");
  }

  try {
    show("adminResult", "미휴무 처리 중입니다...");

    const data = await jsonp({
      action: "compProcess",
      password,
      rowNo,
      processType
    });

    if (!data.ok) {
      show("adminResult", data.message || "처리 실패");
      return;
    }

    show("adminResult", data.message || "처리되었습니다.");
    setTimeout(loadCompAdminList, 800);

  } catch (e) {
    show("adminResult", "미휴무 처리 중 오류가 발생했습니다.");
  }
}
function showAdminTab(tab){

  const leave = document.getElementById("leaveTab");
  const comp = document.getElementById("compTab");
  const employee = document.getElementById("employeeTab");
  const ledger = document.getElementById("ledgerTab");

  if(leave) leave.classList.add("hidden");
  if(comp) comp.classList.add("hidden");
  if(employee) employee.classList.add("hidden");
  if(ledger) ledger.classList.add("hidden");

  switch(tab){

    case "leave":
      if(leave) leave.classList.remove("hidden");
      break;

    case "comp":
      if(comp) comp.classList.remove("hidden");
      break;

    case "employee":
      if(employee) employee.classList.remove("hidden");
      break;

    case "ledger":
      if(ledger) ledger.classList.remove("hidden");
      break;

  }

}
window.addEventListener("DOMContentLoaded",function(){

    if(document.getElementById("leaveTab")){

        showAdminTab("leave");

    }

});
/* =========================
   관리자 직원관리
========================= */

async function loadEmployees() {
  const password = $("password") ? $("password").value.trim() : "";
  const tbody = $("employeeBody");
  const resultBox = $("adminResult");

  if (!tbody) return;

  if (!password) {
    show("adminResult", "관리자 비밀번호를 입력하세요.");
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="employee-empty">
          관리자 비밀번호를 입력하고 직원목록을 불러오세요.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="employee-empty">
        직원목록을 불러오는 중입니다...
      </td>
    </tr>
  `;

  try {
    const data = await jsonp({
      action: "employees",
      password
    });

    if (!data.ok) {
      show("adminResult", data.message || "직원목록 조회 실패");
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="employee-empty">
            직원목록을 불러오지 못했습니다.
          </td>
        </tr>
      `;
      return;
    }

    employeeRows = Array.isArray(data.rows) ? data.rows : [];

    if (resultBox) {
      resultBox.classList.remove("show");
    }

    renderEmployees();

    const activeCount = employeeRows.filter(function (employee) {
      return String(employee.status || "재직").trim() !== "퇴사";
    }).length;

    if ($("statEmployees")) {
      $("statEmployees").textContent = String(activeCount);
    }

  } catch (e) {
    show(
      "adminResult",
      e && e.message
        ? e.message
        : "직원목록 조회 중 오류가 발생했습니다."
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="employee-empty">
          직원목록 조회 중 오류가 발생했습니다.
        </td>
      </tr>
    `;
  }
}


function renderEmployees() {
  const tbody = $("employeeBody");
  const keywordElement = $("employeeKeyword");

  if (!tbody) return;

  const keyword = String(
    keywordElement ? keywordElement.value : ""
  )
    .trim()
    .toLowerCase();

  const filteredRows = employeeRows
    .map(function (employee, originalIndex) {
      return {
        employee,
        originalIndex
      };
    })
    .filter(function (item) {
      const employee = item.employee || {};

      const searchText = [
        employee.store,
        employee.name,
        employee.phone,
        formatEmployeePhone(employee.phone),
        employee.hireDate,
        employee.status
      ]
        .join(" ")
        .toLowerCase();

      return !keyword || searchText.includes(keyword);
    });

  if (!filteredRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="employee-empty">
          검색 조건에 맞는 직원이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredRows
    .map(function (item) {
      const employee = item.employee || {};
      const status = String(employee.status || "재직").trim();
      const isRetired = status === "퇴사";

      return `
        <tr>
          <td>${escapeEmployeeHtml(employee.store || "-")}</td>
          <td>${escapeEmployeeHtml(employee.name || "-")}</td>
          <td>${escapeEmployeeHtml(formatEmployeePhone(employee.phone))}</td>
          <td>${escapeEmployeeHtml(employee.hireDate || "-")}</td>
          <td>${renderEmployeeStatus(status)}</td>
          <td>
            <button
              type="button"
              class="employee-retire-button"
              onclick="retireEmployeeByIndex(${item.originalIndex})"
              ${isRetired ? "disabled" : ""}
            >
              ${isRetired ? "퇴사완료" : "퇴사처리"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}


async function retireEmployeeByIndex(index) {
  const employee = employeeRows[Number(index)];

  if (!employee) {
    show("adminResult", "퇴사 처리할 직원정보를 찾을 수 없습니다.");
    return;
  }

  const password = $("password") ? $("password").value.trim() : "";

  if (!password) {
    show("adminResult", "관리자 비밀번호를 입력하세요.");
    return;
  }

  if (String(employee.status || "").trim() === "퇴사") {
    show("adminResult", "이미 퇴사 처리된 직원입니다.");
    return;
  }

  const confirmed = confirm(
    employee.name +
      " 직원을 퇴사 처리하시겠습니까?\n\n" +
      "퇴사 처리 후에는 직원 신청 페이지에서 연월차를 신청할 수 없습니다."
  );

  if (!confirmed) return;

  try {
    show("adminResult", employee.name + " 직원 퇴사 처리 중입니다...");

    await postNoCors({
      action: "retireEmployee",
      password,
      store: employee.store || "",
      name: employee.name || "",
      phone: employee.phone || ""
    });

    show(
      "adminResult",
      "퇴사 처리 요청을 보냈습니다. 잠시 후 직원목록을 다시 불러옵니다."
    );

    setTimeout(function () {
      loadEmployees();
    }, 1300);

  } catch (e) {
    show("adminResult", "퇴사 처리 중 오류가 발생했습니다.");
  }
}


function renderEmployeeStatus(status) {
  const value = String(status || "재직").trim();

  if (value === "퇴사") {
    return '<span class="employee-status retired">퇴사</span>';
  }

  if (value === "휴직") {
    return '<span class="employee-status leave">휴직</span>';
  }

  return '<span class="employee-status active">재직</span>';
}


function formatEmployeePhone(phone) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");

  if (digits.length === 10 && digits.startsWith("10")) {
    digits = "0" + digits;
  }

  if (digits.length === 11) {
    return (
      digits.substring(0, 3) +
      "-" +
      digits.substring(3, 7) +
      "-" +
      digits.substring(7)
    );
  }

  if (digits.length === 10) {
    return (
      digits.substring(0, 3) +
      "-" +
      digits.substring(3, 6) +
      "-" +
      digits.substring(6)
    );
  }

  return String(phone || "-");
}


function escapeEmployeeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

