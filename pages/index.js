import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const initialProducts = [
  { id: '1', name: 'Café em grãos', sku: 'CAF-001', category: 'Cafés', unit: 'kg', stock: 8.5, min: 3, cost: 42.9 },
  { id: '2', name: 'Leite integral', sku: 'LAT-001', category: 'Laticínios', unit: 'L', stock: 12, min: 15, cost: 4.79 },
  { id: '3', name: 'Chocolate 40%', sku: 'CHO-040', category: 'Confeitaria', unit: 'kg', stock: 3.2, min: 2, cost: 31.5 },
  { id: '4', name: 'Açúcar refinado', sku: 'ACO-001', category: 'Mercearia', unit: 'kg', stock: 6, min: 4, cost: 4.2 },
  { id: '5', name: 'Copos 300 ml', sku: 'EMB-300', category: 'Embalagens', unit: 'un', stock: 84, min: 100, cost: 0.18 },
  { id: '6', name: 'Canela em pó', sku: 'TEM-003', category: 'Mercearia', unit: 'g', stock: 450, min: 200, cost: 0.035 },
];
const initialMovements = [
  { id: 'm1', product: 'Café em grãos', type: 'Entrada', quantity: 5, reason: 'Compra registrada', date: 'Hoje, 09:20' },
  { id: 'm2', product: 'Leite integral', type: 'Saída', quantity: 3, reason: 'Consumo interno', date: 'Hoje, 09:18' },
  { id: 'm3', product: 'Chocolate 40%', type: 'Entrada', quantity: 2, reason: 'Compra registrada', date: 'Ontem, 16:42' },
];
const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const qty = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(v || 0));
const norm = (v) => String(v || '').trim().toLocaleLowerCase('pt-BR');
const uid = () => Math.random().toString(36).slice(2, 10);
const isLow = (p) => Number(p.stock) <= Number(p.min);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function Icon({ type, size = 20 }) {
  const p = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
    box: <><path d="m12 3 9 4.5v9L12 21l-9-4.5v-9L12 3Z"/><path d="m3.5 7.7 8.5 4.5 8.5-4.5M12 12.2V21"/></>,
    file: <><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    arrows: <><path d="M7 7h13l-3-3M17 17H4l3 3M20 7v5M4 12v5"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m6 9 6 6 6-6"/>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 16.5h.01"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    edit: <><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.5 6 3.5 3.5"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[type] || p.box}</svg>;
}

function parseNfeXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('O arquivo não parece ser um XML válido.');
  const all = Array.from(doc.getElementsByTagName('*'));
  const find = (element, name) => Array.from(element.getElementsByTagName('*')).find((n) => n.localName === name)?.textContent?.trim() || '';
  const ide = all.find((n) => n.localName === 'ide') || doc;
  const emit = all.find((n) => n.localName === 'emit') || doc;
  const items = all.filter((n) => n.localName === 'det').map((det) => {
    const prod = Array.from(det.getElementsByTagName('*')).find((n) => n.localName === 'prod');
    if (!prod) return null;
    const read = (name) => Array.from(prod.getElementsByTagName('*')).find((n) => n.localName === name)?.textContent?.trim() || '';
    return { name: read('xProd'), code: read('cProd'), quantity: Number(read('qCom')) || 1, unit: read('uCom') || 'un', unitPrice: Number(read('vUnCom')) || 0 };
  }).filter((item) => item && item.name);
  if (!items.length) throw new Error('Não encontrei produtos. Use o XML completo da NF-e, não apenas uma foto do DANFE.');
  return { supplier: find(emit, 'xNome') || '', invoiceNumber: find(ide, 'nNF') || '', date: find(ide, 'dhEmi') || find(ide, 'dEmi') || '', source: 'XML de NF-e', items };
}

function localizedValue(raw) {
  let value = String(raw || '').trim();
  if (value.includes(',') && value.includes('.')) value = value.replace(/\./g, '').replace(',', '.');
  else if (value.includes(',')) value = value.replace(',', '.');
  return Number(value);
}

function parseReceiptOcr(text) {
  const output = [];
  const valuePattern = /\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+(?:[.,]\d{2,4})/g;
  const ignore = /(CNPJ|CPF|CUPOM FISCAL|DOCUMENTO AUXILIAR|CHAVE DE ACESSO|PROTOCOLO|SUBTOTAL|TOTAL A PAGAR|VALOR TOTAL|VALOR APROXIMADO|TRIBUTOS|ICMS|COFINS|PIS\b|TROCO|DESCONTO|DINHEIRO|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|PIX\b|FORMA DE PAGAMENTO|CONSUMIDOR|CONSULTA|ENDERE[CÇ]O|INSCRI[CÇ][AÃ]O ESTADUAL)/i;
  String(text || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach((line) => {
    if (ignore.test(line)) return;
    const matches = line.match(valuePattern) || [];
    if (!matches.length) return;
    const values = matches.map(localizedValue).filter((value) => Number.isFinite(value) && value >= 0);
    if (!values.length) return;
    const total = values[values.length - 1];
    const unitPrice = values.length > 1 ? values[values.length - 2] : total;
    let quantity = unitPrice > 0 ? total / unitPrice : 1;
    if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 10000) quantity = 1;
    quantity = Math.round(quantity * 1000) / 1000;
    let name = line.replace(valuePattern, ' ').replace(/\b(?:UN|UND|KG|KGS|G|GR|LT|L|ML|CX|PC|PCT|FD)\b/gi, ' ').replace(/^\s*(?:\d{1,6}\s+){1,3}/, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || ignore.test(name)) return;
    output.push({ name, code: '', quantity: quantity || 1, unit: 'un', unitPrice: unitPrice || total });
  });
  return output.slice(0, 50);
}

export default function Home() {
  const [supabase] = useState(() => HAS_SUPABASE_CONFIG ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(!HAS_SUPABASE_CONFIG);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [dataReady, setDataReady] = useState(!HAS_SUPABASE_CONFIG);
  const [saveStatus, setSaveStatus] = useState('');
  const [products, setProducts] = useState(HAS_SUPABASE_CONFIG ? [] : initialProducts);
  const [movements, setMovements] = useState(HAS_SUPABASE_CONFIG ? [] : initialMovements);
  const [documents, setDocuments] = useState([]);
  const [view, setView] = useState('stock');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [filter, setFilter] = useState('Todos');
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState('');
  const [editing, setEditing] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0' });
  const [adjust, setAdjust] = useState({ type: 'Entrada', quantity: '1', reason: 'Compra/recebimento' });
  const [draft, setDraft] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processingType, setProcessingType] = useState('xml');
  const [ocrProgress, setOcrProgress] = useState(0);
  const uploadRef = useRef(null);

  useEffect(() => {
    if (supabase) {
      let active = true;
      supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setAuthMessage('Não foi possível consultar a sessão. Atualize a página e tente novamente.');
        setSession(data?.session || null);
        setAuthChecked(true);
      }).catch(() => {
        if (!active) return;
        setAuthMessage('Não foi possível conectar ao serviço de autenticação.');
        setAuthChecked(true);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession || null);
        setAuthChecked(true);
        setLoaded(false);
        setDataReady(false);
        setAuthMessage('');
      });
      return () => { active = false; data.subscription.unsubscribe(); };
    }
    try {
      const saved = localStorage.getItem('projeto-gpt-stock-v1');
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.products)) setProducts(data.products);
        if (Array.isArray(data.movements)) setMovements(data.movements);
        if (Array.isArray(data.documents)) setDocuments(data.documents);
      }
    } catch (_) {}
    setLoaded(true);
    setDataReady(true);
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      if (supabase && authChecked && !session) {
        setProducts([]);
        setMovements([]);
        setDocuments([]);
        setLoaded(true);
        setDataReady(false);
      }
      return;
    }
    let active = true;
    setLoaded(false);
    setDataReady(false);
    supabase.from('inventory_state')
      .select('state')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error: dbError }) => {
        if (!active) return;
        if (dbError) {
          setAuthMessage('Não foi possível ler o banco de dados. Verifique se a estrutura SQL foi aplicada no projeto Supabase.');
          setLoaded(true);
          return;
        }
        const state = data?.state || { products: [], movements: [], documents: [] };
        setProducts(Array.isArray(state.products) ? state.products : []);
        setMovements(Array.isArray(state.movements) ? state.movements : []);
        setDocuments(Array.isArray(state.documents) ? state.documents : []);
        setLoaded(true);
        setDataReady(true);
      })
      .catch(() => {
        if (!active) return;
        setAuthMessage('Falha ao carregar os dados. Confira a conexão com o banco e tente novamente.');
        setLoaded(true);
      });
    return () => { active = false; };
  }, [supabase, session?.user?.id, authChecked]);

  useEffect(() => {
    if (!loaded || supabase) return;
    try { localStorage.setItem('projeto-gpt-stock-v1', JSON.stringify({ products, movements, documents })); } catch (_) {}
  }, [loaded, products, movements, documents, supabase]);

  useEffect(() => {
    if (!supabase || !session || !dataReady) return;
    setSaveStatus('Salvando…');
    const timer = setTimeout(async () => {
      const payload = { user_id: session.user.id, state: { products, movements, documents }, updated_at: new Date().toISOString() };
      const { error: saveError } = await supabase.from('inventory_state').upsert(payload, { onConflict: 'user_id' });
      if (saveError) {
        setSaveStatus('Falha ao salvar');
        setToast('Não foi possível salvar no banco. Confira a conexão antes de continuar.');
      } else {
        setSaveStatus('Sincronizado');
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [supabase, session?.user?.id, dataReady, products, movements, documents]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!supabase || !authEmail.trim() || authPassword.length < 8) {
      setAuthMessage('Informe um e-mail válido e uma senha com pelo menos 8 caracteres.');
      return;
    }
    setAuthBusy(true);
    setAuthMessage('');
    try {
      if (authMode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (signUpError) throw signUpError;
        setAuthMessage(data.session ? 'Conta criada. Entrando…' : 'Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.');
        if (data.session) setSession(data.session);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (signInError) throw signInError;
      }
    } catch (error) {
      setAuthMessage(error?.message || 'Não foi possível autenticar. Confira os dados e tente novamente.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setToast('Não foi possível encerrar a sessão.');
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3300);
    return () => clearTimeout(timer);
  }, [toast]);

  const low = products.filter(isLow);
  const value = products.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.cost || 0), 0);
  const units = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const categories = ['Todas', ...new Set(products.map((p) => p.category).filter(Boolean))];
  const shownProducts = useMemo(() => products.filter((p) => {
    const matches = [p.name, p.sku, p.category].some((v) => norm(v).includes(norm(query)));
    const matchesCategory = category === 'Todas' || p.category === category;
    const matchesFilter = filter === 'Todos' || (filter === 'Estoque baixo' ? isLow(p) : !isLow(p));
    return matches && matchesCategory && matchesFilter;
  }), [products, query, category, filter]);

  const dateNow = () => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const page = view === 'stock' ? ['VISÃO GERAL', 'Controle de estoque', 'Acompanhe produtos, quantidades e níveis mínimos.'] : view === 'documents' ? ['COMPRAS & ENTRADAS', 'Documentos fiscais', 'Importe documentos e confira os itens antes de atualizar o estoque.'] : ['RASTREABILIDADE', 'Movimentações', 'Consulte entradas, saídas e ajustes registrados.'];

  function openProduct(product) {
    setEditing(product || null);
    setProductForm(product ? { name: product.name, sku: product.sku || '', category: product.category || 'Outros', unit: product.unit || 'un', stock: String(product.stock), min: String(product.min), cost: String(product.cost) } : { name: '', sku: '', category: 'Mercearia', unit: 'un', stock: '0', min: '0', cost: '0' });
    setModal('product');
  }
  function saveProduct(event) {
    event.preventDefault();
    const name = productForm.name.trim();
    if (!name) return;
    if (editing) {
      setProducts((old) => old.map((p) => p.id === editing.id ? { ...p, ...productForm, stock: Number(productForm.stock), min: Number(productForm.min), cost: Number(productForm.cost) } : p));
      setToast('Produto atualizado.');
    } else {
      const item = { ...productForm, id: uid(), name, sku: productForm.sku || ('PRD-' + Date.now().toString().slice(-5)), stock: Number(productForm.stock) || 0, min: Number(productForm.min) || 0, cost: Number(productForm.cost) || 0, updated: dateNow() };
      setProducts((old) => [item, ...old]);
      setMovements((old) => [{ id: uid(), product: name, type: 'Cadastro', quantity: item.stock, reason: 'Cadastro inicial', date: dateNow() }, ...old]);
      setToast('Produto cadastrado.');
    }
    setModal('');
  }
  function openAdjustment(product, type = 'Entrada') {
    setEditing(product);
    setAdjust({ type, quantity: '1', reason: type === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' });
    setModal('adjust');
  }
  function saveAdjustment(event) {
    event.preventDefault();
    const amount = Number(adjust.quantity);
    if (!editing || !(amount > 0)) return;
    const delta = adjust.type === 'Saída' ? -amount : amount;
    if (Number(editing.stock) + delta < 0) { setToast('A saída não pode ser maior que o saldo disponível.'); return; }
    setProducts((old) => old.map((p) => p.id === editing.id ? { ...p, stock: Math.round((Number(p.stock) + delta) * 1000) / 1000, updated: dateNow() } : p));
    setMovements((old) => [{ id: uid(), product: editing.name, type: adjust.type, quantity: amount, reason: adjust.reason || 'Ajuste manual', date: dateNow() }, ...old]);
    setModal('');
    setToast('Estoque atualizado.');
  }
  function uploadFile(file) {
    if (!file) return;
    if (uploadRef.current) uploadRef.current.value = '';
    setError('');
    setView('documents');
    const xml = /\.xml$/i.test(file.name) || file.type === 'text/xml' || file.type === 'application/xml';
    if (xml) {
      setProcessingType('xml');
      setBusy(true);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseNfeXml(String(reader.result || ''));
          setDraft({ ...parsed, fileName: file.name, status: 'Aguardando conferência' });
          setView('documents');
          setToast('XML lido. Confira os produtos antes de confirmar.');
        } catch (e) { setError(e.message || 'Não foi possível ler o documento.'); }
        finally { setBusy(false); }
      };
      reader.onerror = () => { setError('Não foi possível abrir o arquivo.'); setBusy(false); };
      reader.readAsText(file);
      return;
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      setProcessingType('ocr');
      setBusy(true);
      setOcrProgress(0);
      setView('documents');
      (async () => {
        let worker;
        try {
          const { createWorker } = await import('tesseract.js');
          worker = await createWorker('por', 1, { logger: (message) => { if (message.status === 'recognizing text') setOcrProgress(Math.round((message.progress || 0) * 100)); } });
          const result = await worker.recognize(file);
          const items = parseReceiptOcr(result.data.text || '');
          setDraft({ supplier: '', invoiceNumber: '', date: '', source: 'Foto (OCR local)', fileName: file.name, status: 'Aguardando conferência', ocrText: result.data.text || '', items: items.length ? items : [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] });
          setToast(items.length ? 'OCR encontrou ' + items.length + ' linhas candidatas. Confira com atenção.' : 'Texto lido, mas não consegui separar os itens; preencha-os manualmente.');
          if (!items.length) setError('A leitura do texto não encontrou itens com preço de forma confiável. O texto reconhecido ficará disponível para consulta; preencha os produtos manualmente.');
        } catch (e) {
          setDraft({ supplier: '', invoiceNumber: '', date: '', source: 'Foto (preenchimento manual)', fileName: file.name, status: 'Aguardando preenchimento', items: [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] });
          setError('Não foi possível fazer o reconhecimento automático desta imagem. Você pode informar os produtos manualmente.');
        } finally {
          if (worker) await worker.terminate().catch(() => {});
          setBusy(false);
          setOcrProgress(0);
        }
      })();
      return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      setDraft({ supplier: '', invoiceNumber: '', date: '', source: 'PDF (preenchimento manual)', fileName: file.name, status: 'Aguardando preenchimento', items: [{ name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] });
      setView('documents');
      setToast('PDF selecionado. Preencha os itens manualmente; a extração automática de PDF ainda não está disponível.');
      return;
    }
    setError('Formato não reconhecido. Envie XML de NF-e, PDF ou imagem JPG/PNG/WEBP.');
  }
  function changeDraft(key, value) { setDraft((d) => ({ ...d, [key]: value })); }
  function changeItem(index, key, value) { setDraft((d) => ({ ...d, items: d.items.map((it, i) => i === index ? { ...it, [key]: ['quantity', 'unitPrice'].includes(key) ? Number(value) : value } : it) })); }
  function confirmDocument() {
    if (!draft || !draft.items.some((it) => it.name.trim() && Number(it.quantity) > 0)) { setError('Informe ao menos um produto com nome e quantidade válida.'); return; }
    const duplicate = documents.some((d) => d.invoiceNumber && draft.invoiceNumber && d.invoiceNumber === draft.invoiceNumber && norm(d.supplier) === norm(draft.supplier));
    if (duplicate && !window.confirm('Já há um documento com este número e fornecedor. Deseja lançar novamente?')) return;
    const items = draft.items.filter((it) => it.name.trim() && Number(it.quantity) > 0);
    const nextProducts = [...products];
    const nextMovements = [...movements];
    items.forEach((it) => {
      const index = nextProducts.findIndex((p) => norm(p.name) === norm(it.name));
      if (index >= 0) {
        const old = nextProducts[index];
        nextProducts[index] = { ...old, stock: Math.round((Number(old.stock) + Number(it.quantity)) * 1000) / 1000, cost: Number(it.unitPrice) > 0 ? Number(it.unitPrice) : old.cost, unit: it.unit || old.unit, updated: dateNow() };
      } else nextProducts.unshift({ id: uid(), name: it.name.trim(), sku: it.code || ('PRD-' + Date.now().toString().slice(-5) + '-' + nextProducts.length), category: 'Outros', unit: it.unit || 'un', stock: Number(it.quantity), min: 0, cost: Number(it.unitPrice) || 0, updated: dateNow() });
      nextMovements.unshift({ id: uid(), product: it.name.trim(), type: 'Entrada', quantity: Number(it.quantity), reason: 'Documento ' + (draft.invoiceNumber ? '#' + draft.invoiceNumber : 'importado'), date: dateNow() });
    });
    setProducts(nextProducts);
    setMovements(nextMovements);
    const { ocrText, ...documentToSave } = draft;
    setDocuments((old) => [{ ...documentToSave, id: uid(), status: 'Conferido e lançado', importedAt: dateNow(), items }, ...old]);
    setDraft(null);
    setError('');
    if (uploadRef.current) uploadRef.current.value = '';
    setToast('Entrada de ' + items.length + (items.length === 1 ? ' item registrada.' : ' itens registrada.'));
    setView('documents');
  }

  if (supabase && !authChecked) {
    return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>PROJETO GPT</small></div></div><div className="auth-loading"><span className="spinner"/><b>Conectando com segurança…</b><p>Verificando sua sessão.</p></div></div></div>;
  }
  if (supabase && !session) {
    return <div className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>PROJETO GPT</small></div></div><div className="auth-eyebrow">CONTROLE DE ESTOQUE</div><h1>{authMode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1><p className="auth-intro">{authMode === 'login' ? 'Entre para acessar produtos, compras e movimentações.' : 'Sua conta terá seus próprios dados de estoque.'}</p><form className="auth-form" onSubmit={handleAuthSubmit}><label className="field"><span>E-mail</span><input type="email" autoComplete="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="voce@exemplo.com"/></label><label className="field"><span>Senha</span><input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Pelo menos 8 caracteres"/></label>{authMessage && <div className="auth-message" role="status">{authMessage}</div>}<button className="btn primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? 'Aguarde…' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</button></form><div className="auth-switch">{authMode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'} <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthMessage(''); }}>{authMode === 'login' ? 'Criar conta' : 'Entrar'}</button></div><div className="auth-security"><Icon type="check" size={16}/> Cada usuário só acessa seu próprio estoque.</div></section></div>;
  }
  if (supabase && session && !dataReady) {
    return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-icon"><Icon type="box" size={24}/></span><div><b>estoque<span>+</span></b><small>PROJETO GPT</small></div></div><div className="auth-loading"><span className="spinner"/><b>Carregando seu estoque…</b><p>Buscando seus dados salvos.</p>{authMessage && <span className="auth-message">{authMessage}</span>}</div></div></div>;
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('stock')}><span className="brand-icon"><Icon type="box" size={24}/></span><span><b>estoque<span>+</span></b><small>PROJETO GPT</small></span></button>
      <div className="side-caption">ESPAÇO DE TRABALHO</div><div className="workspace"><span className="workspace-avatar">E</span><span><b>Meu estoque</b><small>Ambiente de demonstração</small></span><Icon type="down" size={15}/></div>
      <div className="side-caption menu-caption">MENU PRINCIPAL</div><nav className="navigation">
        <button className={view === 'stock' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('stock')}><Icon type="grid"/><span>Visão geral</span></button>
        <button className={view === 'documents' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('documents')}><Icon type="file"/><span>Documentos fiscais</span><i>{documents.length + (draft ? 1 : 0)}</i></button>
        <button className={view === 'movements' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('movements')}><Icon type="arrows"/><span>Movimentações</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-icon"><Icon type="spark" size={18}/></span><b>Menos planilhas.<br/>Mais controle.</b><p>Importe o XML de uma NF-e e confira os produtos antes de lançar as entradas.</p><button onClick={() => uploadRef.current?.click()}>Importar documento <Icon type="chevron" size={14}/></button></div><div className="user-row"><span className="user-avatar">LG</span><span><b>{session?.user?.email || "Administrador"}</b><small>{supabase ? saveStatus || "Banco compartilhado" : "Protótipo local"}</small></span><button title="Sobre os dados" onClick={() => setToast(supabase ? 'Os dados são sincronizados no banco de dados.' : 'Os dados ficam no armazenamento local deste navegador; não há sincronização entre dispositivos.')}><Icon type="sliders" size={17}/></button></div></div>
    </aside>
    <main className="main"><input ref={uploadRef} className="hidden-input" type="file" accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,application/pdf,application/xml,text/xml,image/*" onChange={(e) => uploadFile(e.target.files && e.target.files[0])}/>
      <header className="topbar"><div className="crumb">Workspace <Icon type="chevron" size={14}/><b>{page[1]}</b></div><div className="top-right"><span className="local-pill"><i/>{supabase ? "Banco conectado" : "Protótipo local"}</span><button className="bell" title="Ver itens com estoque baixo" onClick={() => {setView('stock');setFilter('Estoque baixo');}}><Icon type="alert" size={18}/>{low.length > 0 && <em/>}</button><button className="user-avatar user-avatar-button" title={session?.user?.email || "Administrador"} onClick={handleSignOut}>{supabase ? "Sair" : "LG"}</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{page[0]}</div><h1>{page[1]}</h1><p>{page[2]}</p></div><div className="heading-buttons">{view === 'stock' && <button className="btn secondary" onClick={() => setView('movements')}><Icon type="clock" size={17}/>Histórico</button>}<button className="btn primary" onClick={view === 'documents' ? () => uploadRef.current?.click() : () => openProduct(null)}><Icon type={view === 'documents' ? 'upload' : 'plus'} size={18}/>{view === 'documents' ? 'Importar documento' : 'Novo produto'}</button></div></div>

        {view === 'stock' && <>
          <section className="stats">
            <article className="stat"><div className="stat-top"><span>Produtos cadastrados</span><i className="stat-symbol green"><Icon type="box" size={19}/></i></div><strong className="stat-value">{products.length}</strong><div className="stat-foot"><span className="green-dot"/>Itens no catálogo</div></article>
            <article className="stat"><div className="stat-top"><span>Valor em estoque</span><i className="stat-symbol beige"><Icon type="chart" size={19}/></i></div><strong className="stat-value money-value">{money(value)}</strong><div className="stat-foot subtle">Custo estimado dos itens disponíveis</div></article>
            <article className="stat"><div className="stat-top"><span>Estoque baixo</span><i className="stat-symbol yellow"><Icon type="alert" size={19}/></i></div><strong className="stat-value">{low.length}</strong><div className="stat-foot">{low.length ? <span className="warn-text">Precisam de reposição</span> : <span className="green-text">Tudo em dia</span>}</div></article>
            <article className="stat"><div className="stat-top"><span>Quantidade total</span><i className="stat-symbol blue"><Icon type="arrows" size={19}/></i></div><strong className="stat-value">{qty(units)}</strong><div className="stat-foot subtle">Soma das quantidades cadastradas</div></article>
          </section>
          {low.length > 0 && <section className="alert-strip"><span className="alert-icon"><Icon type="alert" size={19}/></span><div><b>{low.length} {low.length === 1 ? 'produto precisa' : 'produtos precisam'} de reposição</b><p>{low.slice(0, 3).map((p) => p.name).join(', ')}{low.length > 3 ? ' e mais ' + (low.length - 3) : ''} estão no mínimo ou abaixo dele.</p></div><button onClick={() => setFilter('Estoque baixo')}>Ver produtos <Icon type="chevron" size={15}/></button></section>}
          <section className="panel"><div className="panel-head"><div><h2>Produtos</h2><p>Gerencie quantidades, custos e níveis mínimos.</p></div><button className="quiet-btn" onClick={() => {setQuery('');setCategory('Todas');setFilter('Todos');}}><Icon type="sliders" size={16}/>Limpar filtros</button></div>
            <div className="filters"><label className="search"><Icon type="search" size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto, código..."/></label><label className="select-filter"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select><Icon type="down" size={13}/></label><label className="select-filter"><span>Status</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>Todos</option><option>Estoque baixo</option><option>Estoque normal</option></select><Icon type="down" size={13}/></label></div>
            <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>CUSTO UNITÁRIO</th><th>VALOR EM ESTOQUE</th><th>STATUS</th><th></th></tr></thead><tbody>{shownProducts.map((p) => <tr key={p.id}><td><div className="product-cell"><span className="product-box"><Icon type="box" size={18}/></span><span><b>{p.name}</b><small>{p.sku || 'Sem código'}</small></span></div></td><td><span className="category-chip">{p.category}</span></td><td><b className={isLow(p) ? 'quantity-low' : 'quantity-ok'}>{qty(p.stock)} <small>{p.unit}</small></b><div className="minimum">Mínimo: {qty(p.min)} {p.unit}</div></td><td>{money(p.cost)}</td><td><b>{money(Number(p.stock) * Number(p.cost))}</b></td><td><span className={isLow(p) ? 'status low-status' : 'status ok-status'}><i/>{isLow(p) ? 'Estoque baixo' : 'Normal'}</span></td><td><div className="row-actions"><button title="Ajustar estoque" onClick={() => openAdjustment(p)}><Icon type="arrows" size={16}/></button><button title="Editar produto" onClick={() => openProduct(p)}><Icon type="edit" size={16}/></button></div></td></tr>)}{!shownProducts.length && <tr><td colSpan="7"><div className="empty"><Icon type="search" size={25}/><b>Nenhum produto encontrado</b><span>Altere os filtros ou cadastre um novo item.</span></div></td></tr>}</tbody></table></div>
            <div className="table-foot"><span>Exibindo <b>{shownProducts.length}</b> de <b>{products.length}</b> produtos</span><span>{supabase ? "Banco de dados compartilhado" : "Dados salvos neste navegador"}</span></div>
          </section>
          <section className="lower-grid"><div className="panel lower-panel"><div className="panel-head"><div><h2>Estoque para revisar</h2><p>Itens no nível mínimo ou abaixo dele.</p></div><button className="text-btn" onClick={() => setFilter('Estoque baixo')}>Ver todos <Icon type="chevron" size={14}/></button></div>{low.length ? low.slice(0, 4).map((p) => <div className="low-row" key={p.id}><span className="low-symbol"><Icon type="alert" size={16}/></span><span className="low-name"><b>{p.name}</b><small>{qty(p.stock)} {p.unit} disponíveis</small></span><span className="low-min"><small>Mínimo</small><b>{qty(p.min)} {p.unit}</b></span><button className="add-small" title="Registrar entrada" onClick={() => openAdjustment(p)}><Icon type="plus" size={16}/></button></div>) : <div className="all-good"><Icon type="check" size={22}/><b>Nenhuma reposição pendente</b></div>}</div>
          <div className="panel lower-panel"><div className="panel-head"><div><h2>Últimas movimentações</h2><p>Entradas e saídas recentes.</p></div><button className="text-btn" onClick={() => setView('movements')}>Ver histórico <Icon type="chevron" size={14}/></button></div>{movements.slice(0, 4).map((m) => <div className="recent-row" key={m.id}><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span className="recent-name"><b>{m.product}</b><small>{m.reason}</small></span><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type === 'Saída' ? '−' : '+'}{qty(m.quantity)}</span></div>)}</div></section>
        </>}

        {view === 'documents' && <>
          <section className="document-banner"><span className="banner-art"><Icon type="file" size={28}/></span><div className="banner-copy"><h2>Da nota fiscal para o estoque</h2><p>Envie o XML da NF-e para ler os itens automaticamente. Fotos de cupons e PDFs podem ser registrados com conferência manual nesta versão.</p><div className="feature-tags"><span><Icon type="check" size={14}/>XML de NF-e</span><span><Icon type="image" size={14}/>Foto ou PDF</span><span><Icon type="check" size={14}/>Conferência antes de lançar</span></div></div><button className="btn primary" onClick={() => uploadRef.current?.click()}><Icon type="upload" size={17}/>Escolher arquivo</button></section>
          {busy && <div className="notice">{processingType === "xml" ? "Lendo o XML da NF-e e identificando os itens…" : "Reconhecendo texto da imagem" + (ocrProgress ? " — " + ocrProgress + "%" : " — preparando o mecanismo OCR") + "…"}</div>}
          {error && <div className="error"><Icon type="alert" size={18}/><span>{error}</span><button onClick={() => setError('')}><Icon type="close" size={16}/></button></div>}
          {draft && <section className="panel review-panel"><div className="panel-head"><div><div className="eyebrow">CONFERÊNCIA DO DOCUMENTO</div><h2>Confira os dados antes de lançar</h2><p>{draft.fileName} · {draft.source === 'XML de NF-e' ? 'Itens extraídos do XML' : 'Preencha os dados identificados no documento'}</p></div><button className="close-btn" onClick={() => {setDraft(null);setError('');if (uploadRef.current) uploadRef.current.value = '';}}><Icon type="close"/></button></div>
            <div className="meta-fields"><label><span>Fornecedor</span><input value={draft.supplier} onChange={(e) => changeDraft('supplier', e.target.value)} placeholder="Nome do fornecedor"/></label><label><span>Número do documento</span><input value={draft.invoiceNumber} onChange={(e) => changeDraft('invoiceNumber', e.target.value)} placeholder="Ex.: 000123"/></label><label><span>Data de emissão</span><input value={draft.date} onChange={(e) => changeDraft('date', e.target.value)} placeholder="Data, se disponível"/></label></div>
            {draft.ocrText && <details className="ocr-text-details"><summary>Texto reconhecido na foto (conferência)</summary><pre>{draft.ocrText}</pre></details>}
            <div className="table-wrap review-table"><table><thead><tr><th>PRODUTO</th><th>QUANTIDADE</th><th>UNIDADE</th><th>CUSTO UNITÁRIO (R$)</th><th>TOTAL</th><th></th></tr></thead><tbody>{draft.items.map((it, i) => <tr key={i}><td><input className="inline-input name-field" value={it.name} onChange={(e) => changeItem(i, 'name', e.target.value)} placeholder="Nome do produto"/></td><td><input className="inline-input small-field" type="number" min="0.001" step="any" value={it.quantity} onChange={(e) => changeItem(i, 'quantity', e.target.value)}/></td><td><input className="inline-input unit-field" value={it.unit} onChange={(e) => changeItem(i, 'unit', e.target.value)}/></td><td><input className="inline-input small-field" type="number" min="0" step="any" value={it.unitPrice} onChange={(e) => changeItem(i, 'unitPrice', e.target.value)}/></td><td><b>{money(Number(it.quantity || 0) * Number(it.unitPrice || 0))}</b></td><td><button className="delete-line" title="Remover item" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}><Icon type="close" size={15}/></button></td></tr>)}</tbody></table></div>
            <div className="review-bottom"><button className="btn secondary" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { name: '', code: '', quantity: 1, unit: 'un', unitPrice: 0 }] }))}><Icon type="plus" size={16}/>Adicionar item</button><div className="review-sum"><span>Total estimado</span><b>{money(draft.items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0))}</b></div></div>
            <div className="caution"><Icon type="alert" size={18}/><p><b>Confira antes de continuar.</b> Ao confirmar, as quantidades serão somadas ao saldo atual. Produtos com nome igual serão associados ao cadastro existente.</p></div>
            <div className="modal-actions"><button className="btn secondary" onClick={() => {setDraft(null);setError('');}}>Cancelar</button><button className="btn primary" onClick={confirmDocument}><Icon type="check" size={17}/>Confirmar entrada no estoque</button></div>
          </section>}
          <section className="panel history-panel"><div className="panel-head"><div><h2>Histórico de documentos</h2><p>Compras conferidas e lançadas no estoque.</p></div><span className="history-count">{documents.length} documentos</span></div>{documents.length ? documents.map((d) => <div className="history-row" key={d.id}><span className="history-file"><Icon type="file" size={19}/></span><span className="history-copy"><b>{d.supplier || d.fileName || 'Documento importado'}</b><small>{d.fileName} · {d.items.length} itens{d.invoiceNumber ? ' · Nº ' + d.invoiceNumber : ''}</small></span><span className="history-date">{d.importedAt || d.date || 'Data não informada'}</span><span className="status ok-status"><i/>{d.status}</span><button className="row-chevron" title="Ver detalhes" onClick={() => setDetailDoc(d)}><Icon type="chevron" size={17}/></button></div>) : <div className="empty-docs"><span className="empty-file"><Icon type="file" size={28}/></span><b>Nenhum documento importado</b><p>Envie o XML de uma NF-e ou selecione uma foto/PDF e cadastre os itens manualmente.</p><button className="btn secondary" onClick={() => uploadRef.current?.click()}><Icon type="upload" size={16}/>Importar primeiro documento</button></div>}</section>
          <div className="privacy-note"><Icon type="check" size={16}/><span>Privacidade: os arquivos são lidos no navegador e não enviados a um servidor. O histórico salva os campos conferidos, não o documento original.</span></div>
        </>}

        {view === 'movements' && <section className="panel movement-panel"><div className="panel-head"><div><h2>Histórico de movimentações</h2><p>Entradas, saídas, cadastros e ajustes deste navegador.</p></div><span className="history-count">{movements.length} registros</span></div>{movements.length ? <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>TIPO</th><th>QUANTIDADE</th><th>MOTIVO</th><th>DATA</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td><div className="product-cell"><span className={m.type === 'Saída' ? 'move-symbol move-out' : 'move-symbol move-in'}><Icon type={m.type === 'Saída' ? 'arrows' : 'plus'} size={16}/></span><span><b>{m.product}</b><small>Movimentação de estoque</small></span></div></td><td><span className={m.type === 'Saída' ? 'move-negative' : 'move-positive'}>{m.type}</span></td><td><b>{qty(m.quantity)}</b></td><td>{m.reason}</td><td>{m.date}</td></tr>)}</tbody></table></div> : <div className="empty-docs">Ainda não há movimentações.</div>}</section>}
        <footer className="footer"><span><b>estoque+</b><i>/</i> Projeto GPT</span><span>Protótipo em desenvolvimento <i>•</i> {supabase ? (saveStatus || 'Banco compartilhado') : (loaded ? 'Dados salvos localmente' : 'Carregando dados')}</span></footer>
      </div>
    </main>

    {modal === 'product' && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">{editing ? 'ATUALIZAÇÃO DE CADASTRO' : 'NOVO CADASTRO'}</div><h2>{editing ? 'Editar produto' : 'Adicionar produto'}</h2><p>Defina os dados básicos para acompanhar o estoque.</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveProduct}><label className="field full"><span>Nome do produto *</span><input required autoFocus value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Ex.: Farinha de trigo"/></label><div className="form-grid"><label className="field"><span>Código / SKU</span><input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="Opcional"/></label><label className="field"><span>Categoria</span><select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>{['Mercearia','Cafés','Laticínios','Confeitaria','Embalagens','Bebidas','Limpeza','Outros'].map((c) => <option key={c}>{c}</option>)}</select></label><label className="field"><span>Unidade</span><select value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}>{['un','kg','g','L','ml','cx','pct','fardo'].map((u) => <option key={u}>{u}</option>)}</select></label><label className="field"><span>Quantidade atual</span><input type="number" min="0" step="any" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}/></label><label className="field"><span>Estoque mínimo</span><input type="number" min="0" step="any" value={productForm.min} onChange={(e) => setProductForm({ ...productForm, min: e.target.value })}/></label><label className="field"><span>Custo unitário (R$)</span><input type="number" min="0" step="any" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}/></label></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal('')}>Cancelar</button><button type="submit" className="btn primary"><Icon type="check" size={17}/>{editing ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form></section></div>}
    {modal === 'adjust' && editing && <div className="overlay" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal('');}}><section className="modal compact" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">MOVIMENTAÇÃO MANUAL</div><h2>Ajustar estoque</h2><p>{editing.name} · saldo atual: {qty(editing.stock)} {editing.unit}</p></div><button className="close-btn" onClick={() => setModal('')}><Icon type="close"/></button></div><form onSubmit={saveAdjustment}><label className="field"><span>Tipo de movimentação</span><select value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value, reason: e.target.value === 'Saída' ? 'Consumo interno' : 'Compra/recebimento' })}><option>Entrada</option><option>Saída</option></select></label><label className="field"><span>Quantidade ({editing.unit})</span><input type="number" required min="0.001" step="any" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}/></label><label className="field"><span>Motivo</span><input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}/></label><div className="modal-actions"><button className="btn secondary" type="button" onClick={() => setModal('')}>Cancelar</button><button className="btn primary" type="submit"><Icon type="check" size={17}/>Registrar {adjust.type.toLowerCase()}</button></div></form></section></div>}
    {detailDoc && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailDoc(null); }}><section className="modal detail-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">DOCUMENTO JÁ PROCESSADO</div><h2>{detailDoc.supplier || detailDoc.fileName || 'Documento fiscal'}</h2><p>{detailDoc.fileName}{detailDoc.invoiceNumber ? ' · Nº ' + detailDoc.invoiceNumber : ''}</p></div><button className="close-btn" onClick={() => setDetailDoc(null)}><Icon type="close"/></button></div><div className="detail-summary"><span><small>Status</small><b>{detailDoc.status}</b></span><span><small>Fornecedor</small><b>{detailDoc.supplier || 'Não informado'}</b></span><span><small>Registrado em</small><b>{detailDoc.importedAt || detailDoc.date || 'Não informado'}</b></span></div><div className="detail-items"><div className="detail-items-head"><b>Itens do documento</b><span>{detailDoc.items.length} itens</span></div>{detailDoc.items.map((it, i) => <div className="detail-item" key={i}><span><b>{it.name}</b><small>{qty(it.quantity)} {it.unit} × {money(it.unitPrice)}</small></span><strong>{money(Number(it.quantity || 0) * Number(it.unitPrice || 0))}</strong></div>)}</div><div className="modal-actions"><button className="btn primary" onClick={() => setDetailDoc(null)}>Fechar detalhes</button></div></section></div>}
    {toast && <div className="toast"><span><Icon type="check" size={17}/></span>{toast}<button onClick={() => setToast('')}><Icon type="close" size={15}/></button></div>}
  </div>;
}
