const API_URL =
  "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

/* 신청 */

async function submitLeave() {

  const name =
    document.getElementById("name").value.trim();

  const phone =
    document.getElementById("phone").value.trim();

  const leaveType =
    document.getElementById("leaveType").value;

  const startDate =
    document.getElementById("startDate").value;

  const endDate =
    document.getElementById("endDate").value;

  const days =
    document.getElementById("days").value;

  const reason =
    document.getElementById("reason").value.trim();

  if (
    !name ||
    !phone ||
    !leaveType ||
    !startDate ||
    !endDate ||
    !days
  ) {
    alert(
      "이름, 연락처, 휴가구분, 시작일, 종료일, 사용일수를 입력하세요."
    );
    return;
  }

  const data = {
    action: "submitLeave",

    workplace: "더큰코리아",

    name: name,

    phone: phone,

    leaveType: leaveType,

    startDate: startDate,

    endDate: endDate,

    usedDays: Number(days),

    reason: reason
  };

  try {

    const btn =
      document.querySelector(".submit-btn");

    btn.disabled = true;
    btn.innerText = "신청 중...";

    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });

    const result = await res.json();

    alert(result.message);

    if (result.success) {

      document.getElementById("leaveType").value = "";

      document.getElementById("startDate").value = "";

      document.getElementById("endDate").value = "";

      document.getElementById("days").value = "";

      document.getElementById("reason").value = "";

    }

  } catch (err) {

    console.log(err);

    alert("신청 실패");

  } finally {

    const btn =
      document.querySelector(".submit-btn");

    btn.disabled = false;
    btn.innerText = "신청하기";

  }

}