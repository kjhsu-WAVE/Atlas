// Global state for records
let allRecords = [];

// Switch between panels (Tabs navigation)
function switchTab(tabName) {
  // Update nav buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
    btn.textContent.includes(tabName === 'customer' ? '客戶' : tabName === 'supplier' ? '供應商' : '清單')
  );
  if (activeBtn) activeBtn.classList.add('active');

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`panel-${tabName}`).classList.add('active');

  // Load records if switched to list
  if (tabName === 'records') {
    fetchRecords();
  }
}

// Switch Supplier Subtype (Company vs Individual)
function switchSupplierSubtype(subtype) {
  // Update buttons
  document.getElementById('btn-subtype-company').classList.remove('active');
  document.getElementById('btn-subtype-individual').classList.remove('active');
  document.getElementById(`btn-subtype-${subtype}`).classList.add('active');

  // Update hidden input value
  document.getElementById('supp-subtype').value = subtype;

  // Modify form labels & validation
  const ubnIdInput = document.getElementById('supp-ubn-id');
  const labelUbnId = document.getElementById('label-ubn-id');
  const labelCompanyName = document.getElementById('label-company-name');
  const labelRegAddress = document.getElementById('label-reg-address');
  const labelMailAddress = document.getElementById('label-mail-address');
  const btnLookup = document.getElementById('btn-supp-lookup');
  
  const idFrontInput = document.getElementById('supp-id-front');
  const idBackInput = document.getElementById('supp-id-back');
  const idGroupElements = document.querySelectorAll('.group-id-upload');

  if (subtype === 'company') {
    labelUbnId.innerHTML = '統一編號 <span class="required">*</span>';
    ubnIdInput.placeholder = '輸入 8 位數統編';
    ubnIdInput.maxLength = 8;
    labelCompanyName.innerHTML = '公司全名 / 發票抬頭 <span class="required">*</span>';
    labelRegAddress.innerHTML = '公司登記地址 <span class="required">*</span>';
    labelMailAddress.innerHTML = '公司通訊地址 <span class="required">*</span>';
    btnLookup.style.display = 'block';
    document.getElementById('btn-supp-moea').style.display = 'block';

    // Hide ID card upload & remove required
    idGroupElements.forEach(el => el.style.display = 'none');
    idFrontInput.required = false;
    idBackInput.required = false;
    
    // Change invoice dropdown values for Company
    const invoiceSelect = document.getElementById('supp-invoice-type');
    invoiceSelect.value = '三聯式發票';
    invoiceSelect.options[0].disabled = false; // 三聯式發票
    invoiceSelect.options[1].disabled = false; // 電子發票
  } else {
    labelUbnId.innerHTML = '身分證字號 <span class="required">*</span>';
    ubnIdInput.placeholder = '輸入身分證字號 (10碼)';
    ubnIdInput.maxLength = 10;
    labelCompanyName.innerHTML = '個人姓名 <span class="required">*</span>';
    labelRegAddress.innerHTML = '個人戶籍地址 <span class="required">*</span>';
    labelMailAddress.innerHTML = '個人聯絡地址 <span class="required">*</span>';
    btnLookup.style.display = 'none';
    document.getElementById('btn-supp-moea').style.display = 'none';

    // Show ID card upload & make required
    idGroupElements.forEach(el => el.style.display = 'block');
    idFrontInput.required = true;
    idBackInput.required = true;

    // Change invoice dropdown values for Individual (usually receipt or labor statement)
    const invoiceSelect = document.getElementById('supp-invoice-type');
    invoiceSelect.value = '收據/勞報單';
  }
}

// Synchronize registered address to mailing address
function syncAddress(type) {
  const syncCheckbox = document.getElementById(`${type === 'customer' ? 'cust' : 'supp'}-sync-addr`);
  const regAddress = document.getElementById(`${type === 'customer' ? 'cust' : 'supp'}-registered-address`).value;
  const mailingInput = document.getElementById(`${type === 'customer' ? 'cust' : 'supp'}-mailing-address`);
  
  if (syncCheckbox.checked) {
    mailingInput.value = regAddress;
  }
}

// Scrape UBN Info from twincn.com via backend
async function lookupUbn(type) {
  const ubnInput = document.getElementById(type === 'customer' ? 'cust-ubn' : 'supp-ubn-id');
  const ubn = ubnInput.value.trim();
  
  if (!ubn || ubn.length !== 8 || isNaN(ubn)) {
    showNotification('請輸入正確的 8 位數統一編號！', 'error');
    return;
  }
  
  const lookupBtn = document.getElementById(`btn-${type === 'customer' ? 'cust' : 'supp'}-lookup`);
  const originalText = lookupBtn.textContent;
  
  // Update button state
  lookupBtn.disabled = true;
  lookupBtn.textContent = '資料查詢中...';
  showNotification('正在自台灣公司網抓取資料，請稍候...', 'info');
  
  try {
    const response = await fetch(`/api/company-info?ubn=${ubn}`);
    const data = await response.json();
    
    if (data.success) {
      // Auto-fill fields
      if (type === 'customer') {
        document.getElementById('cust-company-name').value = data.company_name;
        document.getElementById('cust-registered-address').value = data.address;
        document.getElementById('cust-phone').value = data.phone;
        document.getElementById('cust-capital').value = data.capital;
        
        // Auto-assess credit limit
        calculateCreditLimit();
      } else {
        document.getElementById('supp-company-name').value = data.company_name;
        document.getElementById('supp-registered-address').value = data.address;
        document.getElementById('supp-phone').value = data.phone;
      }
      
      showNotification('成功自動帶入公司資料！', 'success');
    } else {
      showNotification(data.message || '查詢失敗，請檢查統編是否正確', 'error');
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查後端是否啟動', 'error');
    console.error(error);
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = originalText;
  }
}

// Calculate Customer Credit Limit (Base on WCM-029 Policy)
function calculateCreditLimit() {
  const category = document.getElementById('cust-category').value;
  const hasDebtRecords = document.getElementById('cust-debt-records').value === 'true';
  const capital = parseFloat(document.getElementById('cust-capital').value) || 0;
  
  let rating = 'E2';
  let limit = 0;
  let terms = '預收';
  
  // Priority 1: Judicial defaults (has debt records) forces E2 (Prepayment, 0 limit)
  if (hasDebtRecords) {
    rating = 'E2';
    limit = 0;
    terms = '預收';
  } 
  // Priority 2: Pre-defined categories
  else if (category === '集團企業') {
    rating = '集團企業';
    limit = 2000000;
    terms = '月結 60天';
  } else if (category === '關係企業') {
    rating = '關係企業';
    limit = 2000000;
    terms = '月結 60天';
  } else if (category === '政府單位') {
    rating = '政府單位';
    limit = 10000000;
    terms = '依政府規定';
  } else if (category === '公股/類政府機構') {
    rating = '公股/類政府機構';
    limit = 5000000;
    terms = '月結 30天';
  } else if (category === '4A廣告公司') {
    rating = 'A1';
    limit = 2000000;
    terms = '月結 30天';
  } else if (category === '特殊分級') {
    rating = 'E2';
    limit = 0;
    terms = '預收';
  } else if (category === '診所/外國未上市公司') {
    rating = 'E2';
    limit = 0;
    terms = '預收';
  } 
  // Priority 3: Standard corporate (by Capital)
  else {
    if (capital >= 300000000) {
      rating = 'A1';
      limit = 2000000;
      terms = '月結 30天';
    } else if (capital >= 100000000) {
      rating = 'A2';
      limit = 1000000;
      terms = '月結 30天';
    } else if (capital >= 60000000) {
      rating = 'B1';
      limit = 600000;
      terms = '月結 30天';
    } else if (capital >= 30000000) {
      rating = 'B2';
      limit = 400000;
      terms = '月結 30天';
    } else if (capital >= 10000000) {
      rating = 'B3';
      limit = 300000;
      terms = '月結 30天';
    } else {
      // Capital < 10,000,000, no credit limit
      rating = 'E2';
      limit = 0;
      terms = '預收';
    }
  }
  
  // Format numbers for display
  const formattedLimit = 'NT$ ' + limit.toLocaleString();
  
  // Update DOM Elements
  document.getElementById('credit-limit-val').textContent = formattedLimit;
  document.getElementById('cust-credit-limit').value = limit;
  
  document.getElementById('credit-payment-val').textContent = terms;
  document.getElementById('cust-payment-terms').value = terms;
  
  document.getElementById('credit-badge-val').textContent = rating;
  document.getElementById('cust-credit-rating').value = rating;
}

// Toggle supplier payment terms reason field if terms are less than 60 days
function togglePaymentTermsReason() {
  const termsSelect = document.getElementById('supp-payment-terms');
  const reasonGroup = document.getElementById('group-payment-reason');
  const reasonInput = document.getElementById('supp-payment-reason');
  
  // Policy standard is Monthly 60 or 90 days.
  // Less than 60 days is "月結 30天", "即期", or "其他".
  const value = termsSelect.value;
  if (value === '月結 30天' || value === '即期' || value === '其他') {
    reasonGroup.style.display = 'block';
    reasonInput.required = true;
  } else {
    reasonGroup.style.display = 'none';
    reasonInput.required = false;
    reasonInput.value = '';
  }
}

// File Upload Previews
function handleFileSelect(input, previewId) {
  const previewContainer = document.getElementById(previewId);
  const previewImg = previewContainer.querySelector('img');
  
  if (input.files && input.files[0]) {
    const file = input.files[0];
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('上傳檔案不可大於 5MB！', 'error');
      input.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      previewContainer.style.display = 'block';
      
      // Trigger AI OCR for supplier upload zones
      if (input.id.startsWith('supp-')) {
        triggerAIOCR(input);
      }
    };
    reader.readAsDataURL(file);
  } else {
    previewContainer.style.display = 'none';
    previewImg.src = '';
  }
}

// Trigger Gemini OCR for Supplier files
async function triggerAIOCR(input) {
  const file = input.files[0];
  if (!file) return;

  // Determine doc_type and overlay elements from input ID
  let docType = '';
  let overlayId = '';
  
  if (input.id === 'supp-passbook') {
    docType = 'passbook';
    overlayId = 'overlay-supp-passbook';
  } else if (input.id === 'supp-id-front') {
    docType = 'id_front';
    overlayId = 'overlay-supp-id-front';
  } else if (input.id === 'supp-id-back') {
    docType = 'id_back';
    overlayId = 'overlay-supp-id-back';
  }

  if (!docType || !overlayId) return;

  // Show loading overlay
  const overlay = document.getElementById(overlayId);
  if (overlay) overlay.classList.add('active');
  
  showNotification('AI 正在辨識圖檔中，請稍候...', 'info');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', docType);

  try {
    const response = await fetch('/api/ocr/recognize', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (response.ok && result.success && result.data) {
      const data = result.data;
      showNotification('AI 辨識成功！已自動帶入欄位。', 'success');
      
      // Auto-fill and highlight fields based on document type
      if (docType === 'passbook') {
        fillAndHighlight('supp-bank-name', data.bank_name);
        fillAndHighlight('supp-branch-name', data.branch_name);
        fillAndHighlight('supp-bank-code', data.bank_code);
        fillAndHighlight('supp-account-name', data.bank_account_name);
        fillAndHighlight('supp-account-number', data.bank_account_number);
        
        // If subtype is company, also fill company_name with the bank account name
        const subtype = document.getElementById('supp-subtype').value;
        if (subtype === 'company') {
          fillAndHighlight('supp-company-name', data.bank_account_name);
        }
      } else if (docType === 'id_front') {
        fillAndHighlight('supp-ubn-id', data.id_number);
        fillAndHighlight('supp-company-name', data.name);
        fillAndHighlight('supp-account-name', data.name);
      } else if (docType === 'id_back') {
        fillAndHighlight('supp-registered-address', data.address);
        
        // Sync address if checkbox is checked
        const syncCheckbox = document.getElementById('supp-sync-addr');
        if (syncCheckbox && syncCheckbox.checked) {
          syncAddress('supplier');
          
          // Highlight mailing address too
          const mailInput = document.getElementById('supp-mailing-address');
          if (mailInput) {
            mailInput.classList.add('ai-highlight');
            setTimeout(() => mailInput.classList.remove('ai-highlight'), 2000);
          }
        }
      }
    } else {
      showNotification(result.message || 'AI 辨識失敗，請手動填寫欄位。', 'error');
    }
  } catch (error) {
    showNotification('連線失敗，無法呼叫 AI 辨識服務，請手動填寫。', 'error');
    console.error('OCR fetch error:', error);
  } finally {
    // Hide loading overlay
    if (overlay) overlay.classList.remove('active');
  }
}

// Helper to fill input and apply glowing animation
function fillAndHighlight(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null || value === '') return;
  
  el.value = value;
  
  // Add animation class
  el.classList.add('ai-highlight');
  
  // Remove animation class after it completes (2s)
  setTimeout(() => {
    el.classList.remove('ai-highlight');
  }, 2000);
}

// Remove File from upload input and clear preview
function removeUploadedFile(inputId, previewId) {
  const input = document.getElementById(inputId);
  const previewContainer = document.getElementById(previewId);
  const previewImg = previewContainer.querySelector('img');
  
  input.value = '';
  previewContainer.style.display = 'none';
  previewImg.src = '';
}

// Notification System
function showNotification(msg, type = 'info') {
  const notif = document.getElementById('notification');
  const notifMsg = document.getElementById('notification-msg');
  
  notif.className = `notification show ${type}`;
  notifMsg.textContent = msg;
  
  setTimeout(() => {
    notif.classList.remove('show');
  }, 4000);
}

// Submit Form (Customer or Supplier)
async function submitForm(event, type) {
  event.preventDefault();
  
  const form = document.getElementById(`form-${type}`);
  
  // Custom manual checks
  if (type === 'supplier') {
    const subtype = document.getElementById('supp-subtype').value;
    const passbook = document.getElementById('supp-passbook').files[0];
    const idFront = document.getElementById('supp-id-front').files[0];
    const idBack = document.getElementById('supp-id-back').files[0];
    
    if (!passbook) {
      showNotification('供應商存摺圖檔為必填項目！', 'error');
      return;
    }
    
    if (subtype === 'individual' && (!idFront || !idBack)) {
      showNotification('個人供應商身分證正反面影本為必填項目！', 'error');
      return;
    }
  }
  
  const formData = new FormData(form);
  
  // Disable button to prevent double-submit
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.textContent = '資料儲存中...';
  
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('登錄存檔成功，即將下載申請表！', 'success');
      
      // Trigger download if url is provided
      if (result.download_url) {
        const link = document.createElement('a');
        link.href = result.download_url;
        // The browser will download it with this default filename
        const defaultFilename = type === 'customer' 
          ? `W27-客戶基本資料暨信用額度申請表_${result.record_id}.docx`
          : `W29-供應商資料表_${result.record_id}.docx`;
        link.download = defaultFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      form.reset();
      
      // Reset previews
      if (type === 'customer') {
        calculateCreditLimit(); // Reset badge
      } else {
        removeUploadedFile('supp-passbook', 'preview-supp-supp-passbook');
        removeUploadedFile('supp-id-front', 'preview-supp-id-front');
        removeUploadedFile('supp-id-back', 'preview-supp-id-back');
        switchSupplierSubtype('company'); // Reset subtype
      }
      
      // Switch tab to list to see the record
      switchTab('records');
    } else {
      showNotification(result.message || '儲存失敗，請重試', 'error');
    }
  } catch (error) {
    showNotification('連線失敗，請檢查伺服器是否開啟', 'error');
    console.error(error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Fetch all records from Server
async function fetchRecords() {
  try {
    const response = await fetch('/api/records');
    allRecords = await response.json();
    renderRecords();
  } catch (error) {
    showNotification('無法載入歷史清單', 'error');
    console.error(error);
  }
}

// Render records into table
function renderRecords() {
  const tbody = document.getElementById('records-body');
  const emptyMsg = document.getElementById('records-empty');
  tbody.innerHTML = '';
  
  const searchQuery = document.getElementById('records-search').value.toLowerCase().trim();
  const typeFilter = document.getElementById('records-type-filter').value;
  
  // Filter items
  const filtered = allRecords.filter(rec => {
    // Type filter
    if (typeFilter !== 'all' && rec.register_type !== typeFilter) {
      return false;
    }
    
    // Search query filter
    if (searchQuery) {
      const ubn = (rec.ubn || rec.ubn_or_id || '').toLowerCase();
      const name = (rec.company_name || '').toLowerCase();
      const contact = (rec.contact_person || '').toLowerCase();
      const phone = (rec.phone || '').toLowerCase();
      
      if (!ubn.includes(searchQuery) && 
          !name.includes(searchQuery) && 
          !contact.includes(searchQuery) && 
          !phone.includes(searchQuery)) {
        return false;
      }
    }
    
    return true;
  });
  
  if (filtered.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  } else {
    emptyMsg.style.display = 'none';
  }
  
  filtered.forEach(rec => {
    const tr = document.createElement('tr');
    
    // Time formatting
    const dateStr = rec.timestamp.split('T')[0];
    const timeStr = rec.timestamp.split('T')[1].substring(0, 5);
    
    // Type badge
    const typeLabel = rec.register_type === 'customer' ? '客戶' : '供應商';
    const typeClass = rec.register_type;
    
    // Credit or payment info
    let termsInfo = '';
    if (rec.register_type === 'customer') {
      termsInfo = `額度 ${parseFloat(rec.credit_limit).toLocaleString()} (${rec.credit_rating})`;
    } else {
      termsInfo = rec.payment_terms || '月結 60天';
    }
    
    tr.innerHTML = `
      <td>${dateStr} ${timeStr}</td>
      <td><span class="record-badge ${typeClass}">${typeLabel}</span></td>
      <td>${rec.ubn || rec.ubn_or_id || ''}</td>
      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <strong>${rec.company_name}</strong>
      </td>
      <td>${rec.phone || ''}</td>
      <td>${rec.contact_person || ''}</td>
      <td>${termsInfo}</td>
      <td>
        <span class="view-btn" onclick="viewRecordDetails('${rec.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          詳細明細
        </span>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Filter Records on input changes
function filterRecords() {
  renderRecords();
}

// View Record details in Lightbox
function viewRecordDetails(recordId) {
  const rec = allRecords.find(r => r.id === recordId);
  if (!rec) return;
  
  const title = document.getElementById('lb-title');
  const details = document.getElementById('lb-details');
  const attachmentsContainer = document.getElementById('lb-attachments-container');
  const attachmentsGrid = document.getElementById('lb-attachments');
  
  // Set title
  const typeLabel = rec.register_type === 'customer' ? '客戶' : '供應商';
  title.innerHTML = `${typeLabel}資料登錄明細 - <strong>${rec.company_name}</strong>`;
  
  // Construct fields grid
  let html = '';
  
  const addDetailRow = (label, val) => {
    if (val === undefined || val === null || val === '') val = '-';
    return `
      <div class="detail-item">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${val}</span>
      </div>
    `;
  };
  
  if (rec.register_type === 'customer') {
    html += addDetailRow('申請類別', rec.apply_type);
    html += addDetailRow('申請人/工號', rec.apply_user);
    html += addDetailRow('申請部門', rec.apply_dept);
    html += addDetailRow('統一編號', rec.ubn);
    html += addDetailRow('身分別', rec.identity_type);
    html += addDetailRow('憑證類型', rec.invoice_type);
    html += addDetailRow('資本總額', rec.capital ? parseFloat(rec.capital).toLocaleString() + ' 元' : '-');
    html += addDetailRow('裁判紀錄', rec.has_debt_records === 'true' ? '有未清償負債紀錄' : '無不良紀錄');
    html += addDetailRow('授信級別評分', rec.credit_rating);
    html += addDetailRow('授信額度', 'NT$ ' + parseFloat(rec.credit_limit).toLocaleString() + ' 元');
    html += addDetailRow('應收款項帳期', rec.payment_terms);
    html += addDetailRow('收款方式', rec.payment_method);
    html += addDetailRow('聯絡電話', rec.phone);
    html += addDetailRow('聯絡人姓名', rec.contact_person);
    html += addDetailRow('E-mail', rec.email);
    html += addDetailRow('登記地址', rec.registered_address);
    html += addDetailRow('通訊地址', rec.mailing_address);
    html += addDetailRow('備註說明', rec.notes);
  } else {
    // Supplier
    const subtypeLabel = rec.supplier_subtype === 'company' ? '公司行號' : '個人';
    html += addDetailRow('申請類別', rec.apply_type);
    html += addDetailRow('供應商類型', subtypeLabel);
    html += addDetailRow('統編/身分證字號', rec.ubn_or_id);
    html += addDetailRow('身分別', rec.identity_type);
    html += addDetailRow('憑證類型', rec.invoice_type);
    html += addDetailRow('聯絡電話', rec.phone);
    html += addDetailRow('聯絡人', rec.contact_person);
    html += addDetailRow('E-mail', rec.email);
    html += addDetailRow('戶籍/登記地址', rec.registered_address);
    html += addDetailRow('通訊/聯絡地址', rec.mailing_address);
    html += addDetailRow('付款方式', rec.payment_method);
    html += addDetailRow('交易幣別', rec.currency);
    html += addDetailRow('銀行/分行代碼', rec.bank_code);
    html += addDetailRow('銀行名稱', rec.bank_name);
    html += addDetailRow('分行名稱', rec.branch_name);
    html += addDetailRow('匯款戶名', rec.bank_account_name);
    html += addDetailRow('匯款帳號', rec.bank_account_number);
    html += addDetailRow('付款條件', rec.payment_terms);
    if (rec.payment_terms_reason) {
      html += addDetailRow('提早付款原因說明', rec.payment_terms_reason);
    }
    html += addDetailRow('備註說明', rec.notes);
  }
  
  details.innerHTML = html;
  
  // Construct attachment list
  let attachHtml = '';
  const addAttachmentCard = (title, url) => {
    if (!url) return '';
    return `
      <div class="attachment-card">
        <p>${title}</p>
        <a href="${url}" target="_blank">
          <img class="attachment-thumbnail" src="${url}" alt="${title}">
        </a>
      </div>
    `;
  };
  
  attachHtml += addAttachmentCard('銀行存摺封面影本', rec.passbook_url);
  attachHtml += addAttachmentCard('身分證正面影本', rec.id_front_url);
  attachHtml += addAttachmentCard('身分證反面影本', rec.id_back_url);
  
  if (attachHtml) {
    attachmentsContainer.style.display = 'block';
    attachmentsGrid.innerHTML = attachHtml;
  } else {
    attachmentsContainer.style.display = 'none';
  }
  
  // Show lightbox
  document.getElementById('lightbox').style.display = 'flex';
}

// Close Lightbox
function closeLightbox(event) {
  document.getElementById('lightbox').style.display = 'none';
}

// Open MOEA (Ministry of Economic Affairs) findbiz query in a new tab
function openMOEASearch(type = 'customer') {
  const ubnInput = document.getElementById(type === 'customer' ? 'cust-ubn' : 'supp-ubn-id');
  const ubn = ubnInput.value.trim();
  
  if (type === 'supplier') {
    const subtype = document.getElementById('supp-subtype').value;
    if (subtype === 'individual') {
      showNotification('個人供應商無商工登記資料可查詢！', 'error');
      return;
    }
  }
  
  if (!ubn || ubn.length !== 8 || isNaN(ubn)) {
    showNotification('請先輸入正確的 8 位數統一編號再點選查詢！', 'error');
    return;
  }
  window.open(`https://findbiz.nat.gov.tw/fts/company/${ubn}`, '_blank');
}

// Open Judicial Yuan Judgments query in a new tab
function openJudicialSearch(type = 'customer') {
  const nameInput = document.getElementById(type === 'customer' ? 'cust-company-name' : 'supp-company-name');
  const name = nameInput.value.trim();
  if (!name) {
    showNotification('請先輸入或自動帶入公司名稱再點選查詢！', 'error');
    return;
  }
  window.open(`https://judgment.judicial.gov.tw/FJUD/qy.aspx?q=${encodeURIComponent(name)}`, '_blank');
}

// Initial setup
window.addEventListener('DOMContentLoaded', () => {
  // Load list immediately (public access)
  fetchRecords();
  
  // Setup drag-and-drop styles
  const dropzones = document.querySelectorAll('.upload-zone');
  dropzones.forEach(zone => {
    ['dragenter', 'dragover'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--accent)';
        zone.style.background = 'rgba(6, 182, 212, 0.08)';
      }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border-color)';
        zone.style.background = 'rgba(15, 23, 42, 0.4)';
      }, false);
    });
  });

  // Setup bank code auto-complete lookup
  const bankCodeInput = document.getElementById('supp-bank-code');
  if (bankCodeInput) {
    bankCodeInput.addEventListener('input', async (e) => {
      const code = e.target.value.trim();
      if (code.length === 7 && !isNaN(code)) {
        try {
          const response = await fetch(`/api/bank/lookup?code=${code}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              const data = result.data;
              fillAndHighlight('supp-bank-name', data.bank_name);
              fillAndHighlight('supp-branch-name', data.branch_name);
              showNotification(`已自動帶入代碼 ${code} 的銀行分行資訊！`, 'success');
            }
          }
        } catch (error) {
          console.error('Bank code lookup error:', error);
        }
      }
    });
  }
});

// Auth State
let currentUser = null;

// Show/Hide Auth Overlay
function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('user-status-bar').style.display = 'none';
}

function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('user-status-bar').style.display = 'flex';
}

// Switch auth view (login, register, forgot)
function switchAuthView(viewName) {
  document.querySelectorAll('.auth-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`auth-${viewName}-view`).classList.add('active');
}

// Send OTP verification code
async function sendOtpCode(type) {
  const emailInput = document.getElementById(type === 'register' ? 'register-email' : 'forgot-email');
  const email = emailInput.value.trim();
  const btn = document.getElementById(type === 'register' ? 'btn-send-reg-code' : 'btn-send-reset-code');
  
  if (!email || !(email.endsWith('@wavenet.com.tw') || email.endsWith('.wavenet.com.tw'))) {
    showNotification('請輸入正確的潮網電子郵件 (@wavenet.com.tw)！', 'error');
    return;
  }
  
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '傳送中...';
  
  try {
    const response = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showNotification(data.message, 'success');
      // Countdown lock on button (60s)
      let seconds = 60;
      const interval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          btn.textContent = originalText;
        } else {
          btn.textContent = `重新傳送(${seconds}s)`;
        }
      }, 1000);
    } else {
      showNotification(data.detail || data.message || '傳送失敗，請重試', 'error');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查網路。', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
    console.error(error);
  }
}

// Handle Register submit
async function handleRegisterSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('register-email').value.trim();
  const code = document.getElementById('register-code').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  
  if (password !== confirmPassword) {
    showNotification('密碼與確認密碼不符！', 'error');
    return;
  }
  
  if (password.length < 6) {
    showNotification('密碼長度需至少為 6 個字元！', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showNotification(data.message || '註冊成功，請登入', 'success');
      // Clear forms
      document.getElementById('register-email').value = '';
      document.getElementById('register-code').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm-password').value = '';
      switchAuthView('login');
    } else {
      showNotification(data.detail || data.message || '註冊失敗', 'error');
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查網路。', 'error');
    console.error(error);
  }
}

// Handle Login submit
async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showNotification(data.message || '登入成功', 'success');
      currentUser = data.email;
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      
      // Update view
      document.getElementById('current-user-email').textContent = currentUser;
      hideAuthOverlay();
      checkPermissions();
      
      // Load current lists
      fetchRecords();
    } else {
      showNotification(data.detail || data.message || '登入失敗，請確認信箱與密碼', 'error');
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查網路。', 'error');
    console.error(error);
  }
}

// Handle Forgot password submit
async function handleForgotSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const code = document.getElementById('forgot-code').value.trim();
  const newPassword = document.getElementById('forgot-new-password').value;
  const confirmPassword = document.getElementById('forgot-confirm-password').value;
  
  if (newPassword !== confirmPassword) {
    showNotification('密碼與確認密碼不符！', 'error');
    return;
  }
  
  if (newPassword.length < 6) {
    showNotification('密碼長度需至少為 6 個字元！', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, new_password: newPassword, code })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showNotification(data.message || '密碼重設成功，請登入', 'success');
      document.getElementById('forgot-email').value = '';
      document.getElementById('forgot-code').value = '';
      document.getElementById('forgot-new-password').value = '';
      document.getElementById('forgot-confirm-password').value = '';
      switchAuthView('login');
    } else {
      showNotification(data.detail || data.message || '重設失敗，請確認驗證碼', 'error');
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查網路。', 'error');
    console.error(error);
  }
}

// Handle Logout
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    showNotification('已成功登出', 'info');
    showAuthOverlay();
  } catch (error) {
    console.error('Logout error:', error);
    currentUser = null;
    showAuthOverlay();
  }
}

// Check session on backend
async function checkSession() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    if (response.ok && data.success) {
      currentUser = data.email;
      document.getElementById('current-user-email').textContent = currentUser;
      hideAuthOverlay();
      checkPermissions();
      // Load list
      fetchRecords();
    } else {
      showAuthOverlay();
    }
  } catch (error) {
    showAuthOverlay();
    console.error(error);
  }
}

// Check permissions and lock/unlock credit assessment fields
function checkPermissions() {
  // All fields are enabled for everyone in public mode
  const categorySelect = document.getElementById('cust-category');
  const debtSelect = document.getElementById('cust-debt-records');
  const paymentMethodSelect = document.getElementById('cust-payment-method');
  const currencySelect = document.getElementById('cust-currency');
  const notesTextarea = document.getElementById('cust-notes');
  const lockNotice = document.getElementById('credit-lock-notice');
  
  categorySelect.disabled = false;
  debtSelect.disabled = false;
  paymentMethodSelect.disabled = false;
  currencySelect.disabled = false;
  notesTextarea.disabled = false;
  
  if (lockNotice) lockNotice.style.display = 'none';
}

// Fetch interceptor removed for public mode

// Change Password Modal Actions
function openChangePasswordModal() {
  document.getElementById('change-pw-modal').style.display = 'flex';
}

function closeChangePasswordModal(event) {
  document.getElementById('change-pw-modal').style.display = 'none';
  // Clear values
  document.getElementById('change-old-password').value = '';
  document.getElementById('change-new-password').value = '';
  document.getElementById('change-confirm-password').value = '';
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const oldPassword = document.getElementById('change-old-password').value;
  const newPassword = document.getElementById('change-new-password').value;
  const confirmPassword = document.getElementById('change-confirm-password').value;
  
  if (newPassword !== confirmPassword) {
    showNotification('新密碼與確認新密碼不符！', 'error');
    return;
  }
  
  if (newPassword.length < 6) {
    showNotification('新密碼長度需至少為 6 個字元！', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showNotification(data.message || '密碼修改成功！', 'success');
      closeChangePasswordModal();
    } else {
      showNotification(data.detail || data.message || '修改失敗，請確認目前密碼是否正確', 'error');
    }
  } catch (error) {
    showNotification('伺服器連線失敗，請檢查網路。', 'error');
    console.error(error);
  }
}
