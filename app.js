/* ==========================================================
   스마트 바코드 쇼핑 웹앱 - 최종본
   파일 역할: 앱의 모든 동작을 담당합니다.

   전체 흐름
     바코드 인식 → 상품코드 추출 → 등록 상품 검색
     → 등록 URL 확인 → https 확인 → 허용 도메인 확인
     → 카운트다운 → 쇼핑몰 이동
   ========================================================== */

"use strict";

/* 전체 코드를 익명 함수로 감싸 다른 스크립트와 이름이 충돌하지 않게 합니다. */
(function () {

  /* ========================================================
     [1] 설정값
     이 부분만 고치면 앱 동작을 바꿀 수 있습니다.
  ======================================================== */
  var CONFIG = {
    // 쇼핑몰로 이동하기 전 기다리는 시간(초)
    countdownSeconds: 3,

    // 이동을 허용할 도메인 목록 (보안 핵심!)
    // 여기에 없는 도메인은 절대 이동하지 않습니다.
    // 실제 쇼핑몰을 쓰려면 아래에 도메인을 추가하세요. 예) "smartstore.naver.com"
    allowedDomains: [
      "example.com"
    ],

    // 같은 바코드를 연속으로 처리하지 않는 시간(밀리초)
    duplicateBlockMs: 3000,

    // 최근 인식 목록에 보관할 최대 개수
    recentMax: 5,

    // 브라우저에 데이터를 저장할 때 쓰는 이름표
    storageKeyProducts: "barcodeShop.products",
    storageKeyRecent: "barcodeShop.recent"
  };


  /* ========================================================
     [2] 기본 상품 데이터 (테스트용 3개)
     나중에 JSON 파일이나 데이터베이스로 바꾸기 쉽도록
     "상품코드: {name, url}" 형태로 만들었습니다.
  ======================================================== */
  var DEFAULT_PRODUCTS = {
    "SHOP001": { name: "아메리카노", url: "https://example.com/product/001" },
    "SHOP002": { name: "노트북",     url: "https://example.com/product/002" },
    "SHOP003": { name: "운동화",     url: "https://example.com/product/003" }
  };


  /* ========================================================
     [3] 안전한 저장소
     브라우저 설정에 따라 localStorage가 막혀 있을 수 있으므로
     try/catch로 감싸 오류가 나도 앱이 멈추지 않게 합니다.
  ======================================================== */
  var Storage = {
    load: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[저장소] 불러오기 실패:", e);
        return fallback;
      }
    },
    save: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn("[저장소] 저장 실패:", e);
        return false;
      }
    }
  };


  /* ========================================================
     [4] 상품 저장소
     나중에 서버(JSON/DB)로 바꿀 때 이 부분만 고치면 됩니다.
  ======================================================== */
  var ProductStore = {
    items: {},

    init: function () {
      // 저장된 상품이 있으면 불러오고, 없으면 기본 3개를 사용합니다.
      var saved = Storage.load(CONFIG.storageKeyProducts, null);
      this.items = saved || JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    },

    // 상품코드로 상품 하나 찾기 (없으면 null)
    find: function (code) {
      if (!code) return null;
      var key = String(code).trim().toUpperCase();
      return Object.prototype.hasOwnProperty.call(this.items, key)
        ? this.items[key]
        : null;
    },

    // 상품 추가 또는 수정
    add: function (code, name, url) {
      this.items[String(code).trim().toUpperCase()] = { name: name, url: url };
      Storage.save(CONFIG.storageKeyProducts, this.items);
    },

    // 전체 상품 목록을 배열로 반환
    all: function () {
      var self = this;
      return Object.keys(this.items).map(function (code) {
        return {
          code: code,
          name: self.items[code].name,
          url: self.items[code].url
        };
      });
    }
  };


  /* ========================================================
     [5] 화면 요소 찾기
  ======================================================== */
  function $(id) {
    return document.getElementById(id);
  }

  var el = {};          // 화면 요소를 담아둘 상자
  var screens = {};     // 화면 4개

  function collectElements() {
    screens = {
      home: $("screenHome"),
      create: $("screenCreate"),
      scan: $("screenScan"),
      result: $("screenResult")
    };

    el.btnGoScan = $("btnGoScan");
    el.btnGoCreate = $("btnGoCreate");
    el.btnBackFromCreate = $("btnBackFromCreate");
    el.btnBackFromScan = $("btnBackFromScan");
    el.btnBackFromResult = $("btnBackFromResult");
    el.btnCancelScan = $("btnCancelScan");
    el.btnRetryCamera = $("btnRetryCamera");

    el.inputName = $("inputName");
    el.inputCode = $("inputCode");
    el.inputUrl = $("inputUrl");
    el.createError = $("createError");
    el.btnMakeBarcode = $("btnMakeBarcode");
    el.btnSaveBarcode = $("btnSaveBarcode");
    el.saveHint = $("saveHint");

    el.barcodeCanvas = $("barcodeCanvas");
    el.barcodePlaceholder = $("barcodePlaceholder");
    el.barcodeInfo = $("barcodeInfo");
    el.infoName = $("infoName");
    el.infoCode = $("infoCode");
    el.infoUrl = $("infoUrl");

    el.video = $("video");
    el.cameraPlaceholder = $("cameraPlaceholder");
    el.cameraGuide = $("cameraGuide");
    el.scanStatus = $("scanStatus");
    el.cameraError = $("cameraError");
    el.cameraErrorTitle = $("cameraErrorTitle");
    el.cameraErrorText = $("cameraErrorText");

    el.resultSuccess = $("resultSuccess");
    el.resultFail = $("resultFail");
    el.resultName = $("resultName");
    el.resultCode = $("resultCode");
    el.resultUrl = $("resultUrl");
    el.countdownSec = $("countdownSec");
    el.countdownNumber = $("countdownNumber");
    el.btnGoNow = $("btnGoNow");
    el.btnCancelMove = $("btnCancelMove");
    el.failCode = $("failCode");
    el.failReason = $("failReason");
    el.btnRescan = $("btnRescan");
    el.btnGoHomeFromFail = $("btnGoHomeFromFail");

    el.productList = $("productList");
    el.productCount = $("productCount");
    el.recentList = $("recentList");
    el.recentEmpty = $("recentEmpty");
    el.btnClearRecent = $("btnClearRecent");

    // 하나라도 없으면 id 오타이므로 알려줍니다.
    var missing = [];
    Object.keys(screens).forEach(function (k) {
      if (!screens[k]) missing.push("screen:" + k);
    });
    Object.keys(el).forEach(function (k) {
      if (!el[k]) missing.push(k);
    });

    if (missing.length > 0) {
      console.error("[오류] 다음 요소를 찾지 못했습니다:", missing);
      alert("화면을 불러오지 못했습니다.\nindex.html 파일을 다시 확인해주세요.");
      return false;
    }
    return true;
  }


  /* ========================================================
     [6] 화면 전환
  ======================================================== */
  function showScreen(name) {
    if (!screens[name]) {
      console.error("[오류] '" + name + "' 화면이 없습니다.");
      return;
    }
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.remove("screen--active");
    });
    screens[name].classList.add("screen--active");
    window.scrollTo(0, 0);
  }


  /* ========================================================
     [7] 보안 검사 — 이 앱에서 가장 중요한 부분
     바코드에서 읽은 글자를 절대 그대로 주소창에 넣지 않습니다.
  ======================================================== */

  /* (1) 바코드 값이 상품코드로 쓸 수 있는 모양인지 확인 */
  function isValidCodeFormat(code) {
    // 영문 대소문자, 숫자, 하이픈, 밑줄 1~30자만 허용
    return /^[A-Za-z0-9_-]{1,30}$/.test(code);
  }

  /* (2) URL이 안전한지 확인 → { ok: true/false, reason: "이유" } */
  function checkUrlSafety(rawUrl) {
    var url;

    // 주소 형식 자체가 틀렸는지 확인
    try {
      url = new URL(rawUrl);
    } catch (e) {
      return { ok: false, reason: "주소 형식이 올바르지 않습니다." };
    }

    // https 만 허용 → javascript:, data:, file:, http: 모두 자동 차단됩니다.
    if (url.protocol !== "https:") {
      return { ok: false, reason: "https:// 로 시작하는 주소만 이동할 수 있습니다." };
    }

    // 허용 도메인 목록 확인
    var host = url.hostname.toLowerCase();
    var allowed = CONFIG.allowedDomains.some(function (domain) {
      var d = domain.toLowerCase();
      // 도메인이 정확히 같거나, 하위 도메인(shop.example.com)인 경우 허용
      return host === d || host.endsWith("." + d);
    });

    if (!allowed) {
      return { ok: false, reason: "허용되지 않은 도메인입니다. (" + host + ")" };
    }

    return { ok: true, url: url.href };
  }

  /* (3) 화면에 글자를 안전하게 넣기 (HTML 태그가 실행되지 않게) */
  function setText(element, text) {
    element.textContent = String(text);
  }


  /* ========================================================
     [8] 바코드 생성 (JsBarcode)
  ======================================================== */
  var lastBarcodeCode = "";   // 저장 버튼에서 파일 이름으로 사용

  function showCreateError(message) {
    if (!message) {
      el.createError.hidden = true;
      el.createError.textContent = "";
      return;
    }
    el.createError.hidden = false;
    setText(el.createError, message);
  }

  function handleMakeBarcode() {
    var name = el.inputName.value.trim();
    var code = el.inputCode.value.trim().toUpperCase();
    var url = el.inputUrl.value.trim();

    // (1) 빈칸 확인
    if (!name || !code || !url) {
      showCreateError("상품명, 상품코드, 쇼핑몰 URL을 모두 입력해주세요.");
      return;
    }

    // (2) 상품코드 형식 확인
    if (!isValidCodeFormat(code)) {
      showCreateError("상품코드는 영문·숫자·하이픈(-)·밑줄(_)만 사용할 수 있습니다.");
      return;
    }

    // (3) URL 보안 검사
    var check = checkUrlSafety(url);
    if (!check.ok) {
      showCreateError(check.reason + "\n허용 도메인: " + CONFIG.allowedDomains.join(", "));
      return;
    }

    // (4) 라이브러리가 준비되었는지 확인
    if (typeof window.JsBarcode !== "function") {
      showCreateError("바코드 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해주세요.");
      return;
    }

    // (5) 바코드 그리기
    try {
      window.JsBarcode(el.barcodeCanvas, code, {
        format: "CODE128",   // 요구사항: CODE128 형식
        width: 2,            // 막대 굵기
        height: 90,          // 바코드 높이
        displayValue: true,  // 아래에 글자 표시
        fontSize: 16,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000"
      });
    } catch (e) {
      console.error("[바코드 생성 오류]", e);
      showCreateError("바코드를 만들지 못했습니다. 상품코드를 다시 확인해주세요.");
      return;
    }

    // (6) 화면 정리 및 정보 표시
    showCreateError("");
    el.barcodePlaceholder.hidden = true;
    el.barcodeCanvas.hidden = false;
    el.barcodeInfo.hidden = false;
    el.btnSaveBarcode.hidden = false;
    el.saveHint.hidden = false;

    setText(el.infoName, name);
    setText(el.infoCode, code);
    setText(el.infoUrl, check.url);

    // (7) 상품 목록에 등록 → 바로 스캔해서 테스트할 수 있습니다.
    ProductStore.add(code, name, check.url);
    renderProductList();

    lastBarcodeCode = code;
    console.log("바코드 생성 완료:", code);
  }

  /* 바코드 이미지를 PNG 파일로 저장 */
  function handleSaveBarcode() {
    try {
      var dataUrl = el.barcodeCanvas.toDataURL("image/png");
      var link = document.createElement("a");
      link.href = dataUrl;
      link.download = "barcode-" + (lastBarcodeCode || "code") + ".png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("[저장 오류]", e);
      alert("자동 저장에 실패했습니다.\n화면의 바코드 이미지를 길게 눌러 저장해주세요.");
    }
  }


  /* ========================================================
     [9] 카메라 & 바코드 인식 (ZXing)
  ======================================================== */
  var codeReader = null;      // ZXing 읽기 도구
  var isScanning = false;     // 지금 스캔 중인지
  var lastCode = "";          // 마지막으로 읽은 코드
  var lastCodeTime = 0;       // 마지막으로 읽은 시각 (중복 방지용)

  /* 현재 환경이 카메라를 쓸 수 있는지 확인 */
  function checkEnvironment() {
    // https 또는 localhost 가 아니면 브라우저가 카메라를 막습니다.
    var isLocal = ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;
    if (!window.isSecureContext && !isLocal) {
      return {
        ok: false,
        title: "보안 연결(HTTPS)이 필요합니다.",
        text: "카메라는 https:// 주소에서만 사용할 수 있습니다.\n" +
              "파일을 직접 연 상태(file://)에서는 동작하지 않습니다.\n" +
              "배포 안내를 참고해 https 주소로 접속해주세요."
      };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        ok: false,
        title: "지원되지 않는 브라우저입니다.",
        text: "카메라 기능을 지원하지 않는 브라우저입니다.\n" +
              "안드로이드는 Chrome, 아이폰은 Safari 최신 버전을 사용해주세요."
      };
    }

    if (typeof window.ZXing === "undefined") {
      return {
        ok: false,
        title: "인식 라이브러리를 불러오지 못했습니다.",
        text: "인터넷 연결을 확인한 뒤 페이지를 새로고침해주세요."
      };
    }

    return { ok: true };
  }

  /* 카메라 오류를 사람이 읽을 수 있는 한글 메시지로 바꿔줍니다 */
  function describeCameraError(error) {
    var name = error && error.name ? error.name : "";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        title: "카메라 사용 권한이 필요합니다.",
        text: "브라우저 설정에서 카메라 권한을 허용해주세요.\n" +
              "· 안드로이드 Chrome: 주소창 왼쪽 자물쇠 → 권한 → 카메라 허용\n" +
              "· 아이폰 Safari: 설정 앱 → Safari → 카메라 → 확인"
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        title: "카메라를 찾을 수 없습니다.",
        text: "이 기기에 사용할 수 있는 카메라가 없습니다.\n휴대폰에서 다시 시도해주세요."
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        title: "카메라를 사용할 수 없습니다.",
        text: "다른 앱이 카메라를 쓰고 있을 수 있습니다.\n" +
              "카메라를 쓰는 앱을 모두 끄고 다시 시도해주세요."
      };
    }
    if (name === "OverconstrainedError") {
      return {
        title: "후면 카메라를 열 수 없습니다.",
        text: "요청한 카메라 설정을 지원하지 않습니다.\n다시 시도하면 기본 카메라로 연결합니다."
      };
    }
    if (name === "SecurityError") {
      return {
        title: "보안 설정 때문에 카메라를 열 수 없습니다.",
        text: "https:// 주소로 접속했는지 확인해주세요."
      };
    }
    return {
      title: "카메라를 여는 중 문제가 발생했습니다.",
      text: "페이지를 새로고침한 뒤 다시 시도해주세요.\n(오류: " + (name || "알 수 없음") + ")"
    };
  }

  function showCameraError(title, text) {
    el.cameraError.hidden = false;
    setText(el.cameraErrorTitle, title);
    setText(el.cameraErrorText, text);
    el.cameraPlaceholder.hidden = false;
    setText(el.cameraPlaceholder, "카메라가 꺼져 있습니다.");
    setText(el.scanStatus, "카메라를 사용할 수 없습니다.");
  }

  function hideCameraError() {
    el.cameraError.hidden = true;
  }

  /* 카메라를 켜고 인식을 시작합니다 */
  function startScan() {
    hideCameraError();
    el.cameraGuide.classList.remove("camera__guide--found");
    el.cameraPlaceholder.hidden = false;
    setText(el.cameraPlaceholder, "카메라를 준비하고 있습니다…");
    setText(el.scanStatus, "카메라를 켜는 중입니다…");

    // (1) 환경 확인
    var env = checkEnvironment();
    if (!env.ok) {
      showCameraError(env.title, env.text);
      return;
    }

    // (2) ZXing 읽기 도구 준비 — CODE128만 찾도록 지정하면 인식이 빨라집니다.
    try {
      var hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.CODE_128
      ]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

      codeReader = new ZXing.BrowserMultiFormatReader(hints, 400);
    } catch (e) {
      console.error("[ZXing 준비 오류]", e);
      showCameraError("인식 도구를 준비하지 못했습니다.", "페이지를 새로고침한 뒤 다시 시도해주세요.");
      return;
    }

    isScanning = true;

    // (3) 후면 카메라 우선으로 카메라 열기
    var constraints = {
      video: {
        facingMode: { ideal: "environment" },  // environment = 후면 카메라
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    codeReader
      .decodeFromConstraints(constraints, el.video, onDecode)
      .then(function () {
        el.cameraPlaceholder.hidden = true;
        setText(el.scanStatus, "바코드를 찾고 있습니다…");
      })
      .catch(function (error) {
        console.warn("[후면 카메라 실패] 기본 카메라로 다시 시도합니다.", error);

        // (4) 실패하면 기본 카메라로 한 번 더 시도합니다.
        codeReader
          .decodeFromVideoDevice(undefined, el.video, onDecode)
          .then(function () {
            el.cameraPlaceholder.hidden = true;
            setText(el.scanStatus, "바코드를 찾고 있습니다… (기본 카메라)");
          })
          .catch(function (err2) {
            console.error("[카메라 오류]", err2);
            isScanning = false;
            var msg = describeCameraError(err2);
            showCameraError(msg.title, msg.text);
          });
      });
  }

  /* 카메라를 끕니다 (배터리 절약 + 사생활 보호) */
  function stopScan() {
    isScanning = false;
    if (codeReader) {
      try {
        codeReader.reset();   // 카메라 정지
      } catch (e) {
        console.warn("[카메라 종료 경고]", e);
      }
      codeReader = null;
    }
    // 영상 스트림도 확실히 정리합니다.
    try {
      if (el.video && el.video.srcObject) {
        el.video.srcObject.getTracks().forEach(function (track) {
          track.stop();
        });
        el.video.srcObject = null;
      }
    } catch (e) {
      console.warn("[스트림 종료 경고]", e);
    }
  }

  /* 바코드가 인식될 때마다 호출되는 함수 */
  function onDecode(result, error) {
    // 아직 화면에 바코드가 없을 때도 error가 계속 들어옵니다. (정상)
    if (!result) return;
    if (!isScanning) return;

    var code = String(result.getText()).trim();
    var now = Date.now();

    // 중복 인식 방지: 같은 코드를 짧은 시간 안에 다시 읽으면 무시
    if (code === lastCode && (now - lastCodeTime) < CONFIG.duplicateBlockMs) {
      return;
    }
    lastCode = code;
    lastCodeTime = now;

    // 인식 즉시 카메라를 멈춥니다.
    el.cameraGuide.classList.add("camera__guide--found");
    setText(el.scanStatus, "인식 성공: " + code);
    stopScan();

    // 진동으로 알려줍니다 (지원하는 기기만)
    try {
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (e) { /* 무시 */ }

    handleScannedCode(code);
  }


  /* ========================================================
     [10] 인식된 코드 처리 → 상품 검색 → 이동 준비
  ======================================================== */
  var countdownTimer = null;
  var targetUrl = "";

  function handleScannedCode(rawCode) {
    showScreen("result");

    var code = rawCode.trim().toUpperCase();

    // (1) 코드 형식 검사
    if (!isValidCodeFormat(code)) {
      showFail(rawCode, "바코드 형식이 올바르지 않습니다. 등록된 상품 바코드를 사용해주세요.");
      return;
    }

    // (2) 등록된 상품인지 검색
    var product = ProductStore.find(code);
    if (!product) {
      showFail(code, "이 코드는 등록된 상품 목록에 없습니다. 쇼핑몰로 이동하지 않습니다.");
      return;
    }

    // (3) 등록된 URL의 보안 검사 (https + 허용 도메인)
    var check = checkUrlSafety(product.url);
    if (!check.ok) {
      showFail(code, "등록된 주소가 안전하지 않아 이동을 중단했습니다.\n(" + check.reason + ")");
      return;
    }

    // (4) 통과 → 성공 화면 + 카운트다운
    targetUrl = check.url;
    showSuccess(product.name, code, targetUrl);
    addRecent(code, product.name);
    startCountdown();
  }

  function showSuccess(name, code, url) {
    el.resultSuccess.hidden = false;
    el.resultFail.hidden = true;
    setText(el.resultName, name);
    setText(el.resultCode, code);
    setText(el.resultUrl, url);
  }

  function showFail(code, reason) {
    el.resultSuccess.hidden = true;
    el.resultFail.hidden = false;
    setText(el.failCode, code);
    setText(el.failReason, reason);
    targetUrl = "";
  }

  /* 3 → 2 → 1 카운트다운 후 이동 */
  function startCountdown() {
    stopCountdown();

    var remain = CONFIG.countdownSeconds;
    setText(el.countdownSec, remain);
    setText(el.countdownNumber, remain);

    countdownTimer = setInterval(function () {
      remain = remain - 1;

      if (remain <= 0) {
        stopCountdown();
        goToShop();
        return;
      }

      setText(el.countdownSec, remain);
      setText(el.countdownNumber, remain);
    }, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  /* 실제 이동 — 반드시 검사를 통과한 주소만 사용합니다 */
  function goToShop() {
    if (!targetUrl) return;

    // 마지막으로 한 번 더 검사합니다 (이중 안전장치)
    var check = checkUrlSafety(targetUrl);
    if (!check.ok) {
      showFail("-", "이동 직전 검사에서 차단되었습니다. (" + check.reason + ")");
      return;
    }

    window.location.assign(check.url);
  }


  /* ========================================================
     [11] 목록 표시 (등록 상품 / 최근 인식)
  ======================================================== */
  function renderProductList() {
    var items = ProductStore.all();
    el.productList.innerHTML = "";
    setText(el.productCount, items.length + "개");

    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "list-item";

      var main = document.createElement("div");
      main.className = "list-item__main";

      var nameEl = document.createElement("p");
      nameEl.className = "list-item__name";
      nameEl.textContent = item.name;          // textContent = 안전하게 글자만 넣기

      var subEl = document.createElement("p");
      subEl.className = "list-item__sub";
      subEl.textContent = item.url;

      main.appendChild(nameEl);
      main.appendChild(subEl);

      var codeEl = document.createElement("span");
      codeEl.className = "list-item__code";
      codeEl.textContent = item.code;

      li.appendChild(main);
      li.appendChild(codeEl);
      el.productList.appendChild(li);
    });
  }

  function getRecent() {
    var list = Storage.load(CONFIG.storageKeyRecent, []);
    return Array.isArray(list) ? list : [];
  }

  function addRecent(code, name) {
    var list = getRecent();

    // 같은 코드가 이미 있으면 지우고 맨 앞에 다시 넣습니다.
    list = list.filter(function (item) {
      return item.code !== code;
    });

    list.unshift({
      code: code,
      name: name,
      at: new Date().toLocaleString("ko-KR")
    });

    // 최대 개수만 남깁니다.
    list = list.slice(0, CONFIG.recentMax);

    Storage.save(CONFIG.storageKeyRecent, list);
    renderRecentList();
  }

  function renderRecentList() {
    var list = getRecent();
    el.recentList.innerHTML = "";

    // 목록이 비었으면 안내 문구를 보여줍니다.
    el.recentEmpty.hidden = list.length > 0;

    list.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "list-item";

      var main = document.createElement("div");
      main.className = "list-item__main";

      var nameEl = document.createElement("p");
      nameEl.className = "list-item__name";
      nameEl.textContent = item.name;

      var subEl = document.createElement("p");
      subEl.className = "list-item__sub";
      subEl.textContent = item.at;

      main.appendChild(nameEl);
      main.appendChild(subEl);

      var codeEl = document.createElement("span");
      codeEl.className = "list-item__code";
      codeEl.textContent = item.code;

      li.appendChild(main);
      li.appendChild(codeEl);
      el.recentList.appendChild(li);
    });
  }


  /* ========================================================
     [12] 버튼 연결
  ======================================================== */
  function bindEvents() {

    // --- 홈 화면 ---
    el.btnGoScan.addEventListener("click", function () {
      showScreen("scan");
      startScan();
    });

    el.btnGoCreate.addEventListener("click", function () {
      showScreen("create");
    });

    el.btnClearRecent.addEventListener("click", function () {
      Storage.save(CONFIG.storageKeyRecent, []);
      renderRecentList();
    });

    // --- 바코드 만들기 ---
    el.btnBackFromCreate.addEventListener("click", function () {
      showScreen("home");
    });

    el.btnMakeBarcode.addEventListener("click", handleMakeBarcode);
    el.btnSaveBarcode.addEventListener("click", handleSaveBarcode);

    // 엔터를 눌러도 생성되게 합니다.
    [el.inputName, el.inputCode, el.inputUrl].forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleMakeBarcode();
        }
      });
    });

    // --- 스캔 화면 ---
    el.btnBackFromScan.addEventListener("click", function () {
      stopScan();
      showScreen("home");
    });

    el.btnCancelScan.addEventListener("click", function () {
      stopScan();
      setText(el.scanStatus, "스캔을 취소했습니다.");
      showScreen("home");
    });

    el.btnRetryCamera.addEventListener("click", function () {
      startScan();
    });

    // --- 결과 화면 ---
    el.btnGoNow.addEventListener("click", function () {
      stopCountdown();
      goToShop();
    });

    el.btnCancelMove.addEventListener("click", function () {
      stopCountdown();
      showScreen("home");
    });

    el.btnBackFromResult.addEventListener("click", function () {
      stopCountdown();
      showScreen("home");
    });

    el.btnRescan.addEventListener("click", function () {
      lastCode = "";           // 같은 코드를 다시 읽을 수 있게 초기화
      showScreen("scan");
      startScan();
    });

    el.btnGoHomeFromFail.addEventListener("click", function () {
      showScreen("home");
    });

    // --- 앱을 벗어나거나 화면이 가려지면 카메라를 끕니다 ---
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopScan();
        stopCountdown();
      }
    });

    window.addEventListener("pagehide", function () {
      stopScan();
    });
  }


  /* ========================================================
     [13] 앱 시작
  ======================================================== */
  document.addEventListener("DOMContentLoaded", function () {
    if (!collectElements()) return;

    ProductStore.init();
    renderProductList();
    renderRecentList();
    bindEvents();
    showScreen("home");

    console.log("스마트 바코드 쇼핑 웹앱이 시작되었습니다.");
    console.log("등록 상품:", ProductStore.all());
    console.log("허용 도메인:", CONFIG.allowedDomains);
  });

})();
