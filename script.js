const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

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

function showTab(tab) {
  ["apply", "register", "history"].forEach(n => {
    const b = $(n + "Tab");
    if (b) b.classList.toggle("hidden", n !== tab);
  });

  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));

  const i = tab === "apply" ? 0 : tab === "register" ? 1 : 2;
  const btn = document.querySelectorAll(".tab")[i];
  if (btn) btn.classList.add("active");
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

    list.innerHTML = data.rows.map(renderAdminItem).join("");

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