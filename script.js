// ========================================
// MULTITRACK PRO - PARTE 1/5
// Inicialização, Audio Context e State
// ========================================

// Audio Context
let audioContext = null;
let masterGainNode = null;
let bpmInterval = null;
let vuMeterInterval = null;
let projectsLibraryHandle = null;
// Sistema de biblioteca de arquivos
let libraryFolderHandle = null;  // Referência à pasta da biblioteca
let currentProjectFiles = [];     // Arquivos de áudio do projeto atual
let isFirstRun = true;            // Detecta primeiro acesso ao app
// Detecção de plataforma
// Detecção melhorada
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const supportsFileSystem = 'showDirectoryPicker' in window && !isIOS; // Só bloqueia iOS
// File System API
let projectFolderHandle = null;

// Google Drive API
let googleDriveEnabled = false;
let googleAccessToken = null;
let googleDriveFolderId = null; // ID da pasta "MultiTrack" no Drive
const GOOGLE_CLIENT_ID = '710387058994-ajtmes5kobh3o0oao3d5bps22s52v6r1.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyA0AEysMM-wlSjSf2ud4ZLEe3-i6Ze5DWQ'; // Opcional, mas recomendado
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

// Undo/Redo System
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// State
let state = {
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    activeTab: 'mixer',
    tracks: [],
    markers: [],
    savedProjects: [],
    currentProject: null,
    isImporting: false,
    masterVolume: 80,
    masterMute: false,
    bpm: 120,
    key: 'C',
    isDragging: false,
    markerShortcuts: {},
    preRollTime: 2,
    fadeInTime: 0.5,
    fadeOutTime: 1.5,
    syncOffset: 0,
    libraryPath: null,
    isProjectModified: false,    // ← NOVO
    lastSavedState: null,          // ← NOVO
     // NOVOS CAMPOS PARA GOOGLE DRIVE
    storageMode: 'local', // 'local', 'folder', 'drive'
    googleDriveConnected: false,
    googleDriveEmail: null,
    lastSyncTime: null
};

const trackColors = ['color-yellow', 'color-blue', 'color-green', 'color-red', 'color-purple', 'color-pink', 'color-indigo', 'color-orange'];
const musicalKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ========================================
// TOAST NOTIFICATION SYSTEM
// ========================================

const toastQueue = [];
let toastIdCounter = 0;

function showToast(message, type = 'info', duration = 4000, options = {}) {
    const id = ++toastIdCounter;
    
    const toast = {
        id,
        message,
        type,
        title: options.title || getTitleForType(type),
        duration,
        persistent: options.persistent || false
    };
    
    toastQueue.push(toast);
    renderToasts();
    
    if (!toast.persistent && duration > 0) {
        setTimeout(() => dismissToast(id), duration);
    }
    
    return id;
}

function getTitleForType(type) {
    const titles = {
        success: '✅ Sucesso',
        error: '❌ Erro',
        warning: '⚠️ Atenção',
        info: 'ℹ️ Informação'
    };
    return titles[type] || 'Notificação';
}

function dismissToast(id) {
    const index = toastQueue.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const toastEl = document.querySelector(`[data-toast-id="${id}"]`);
    if (toastEl) {
        toastEl.classList.add('removing');
        setTimeout(() => {
            toastQueue.splice(index, 1);
            renderToasts();
        }, 300);
    } else {
        toastQueue.splice(index, 1);
        renderToasts();
    }
}

function renderToasts() {
    let container = document.querySelector('.toast-container');
    
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    container.innerHTML = toastQueue.map(toast => `
        <div class="toast ${toast.type}" data-toast-id="${toast.id}">
            <div class="toast-icon">
                ${getIconForType(toast.type)}
            </div>
            <div class="toast-content">
                <div class="toast-title">${toast.title}</div>
                <div class="toast-message">${toast.message}</div>
            </div>
            <button class="toast-close" onclick="dismissToast(${toast.id})">
                <i data-lucide="x" style="width: 16px; height: 16px;"></i>
            </button>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function getIconForType(type) {
    const icons = {
        success: '<i data-lucide="check-circle"></i>',
        error: '<i data-lucide="alert-circle"></i>',
        warning: '<i data-lucide="alert-triangle"></i>',
        info: '<i data-lucide="info"></i>'
    };
    return icons[type] || icons.info;
}

// Atalhos úteis
function successToast(message, options) {
    return showToast(message, 'success', 4000, options);
}

function errorToast(message, options) {
    return showToast(message, 'error', 6000, options);
}

function warningToast(message, options) {
    return showToast(message, 'warning', 5000, options);
}

function infoToast(message, options) {
    return showToast(message, 'info', 4000, options);
}

// ========================================
// ENHANCED LOADING OVERLAY
// ========================================

let currentLoadingSteps = [];

function showEnhancedLoading(steps = []) {
    currentLoadingSteps = steps.map((step, index) => ({
        id: index,
        text: step,
        status: index === 0 ? 'active' : 'pending'
    }));
    
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('enhanced');
    
    const content = overlay.querySelector('.loading-content');
    content.classList.add('enhanced');
    
    const spinner = overlay.querySelector('.loading-spinner');
    spinner.classList.add('enhanced');
    
    renderLoadingSteps();
}

function updateLoadingStep(stepIndex, status = 'complete') {
    if (stepIndex >= currentLoadingSteps.length) return;
    
    currentLoadingSteps[stepIndex].status = status;
    
    if (status === 'complete' && stepIndex + 1 < currentLoadingSteps.length) {
        currentLoadingSteps[stepIndex + 1].status = 'active';
    }
    
    renderLoadingSteps();
}

function renderLoadingSteps() {
    const content = document.querySelector('.loading-content.enhanced');
    if (!content || currentLoadingSteps.length === 0) return;
    
    let stepsContainer = content.querySelector('.loading-steps');
    
    if (!stepsContainer) {
        stepsContainer = document.createElement('div');
        stepsContainer.className = 'loading-steps';
        content.appendChild(stepsContainer);
    }
    
    stepsContainer.innerHTML = currentLoadingSteps.map(step => `
        <div class="loading-step ${step.status}">
            <div class="loading-step-icon ${step.status}">
                ${step.status === 'pending' ? '<i data-lucide="circle"></i>' : 
                  step.status === 'active' ? '<i data-lucide="loader"></i>' :
                  '<i data-lucide="check-circle"></i>'}
            </div>
            <div class="loading-step-text">${step.text}</div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function hideEnhancedLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('enhanced');
    
    const content = overlay.querySelector('.loading-content');
    content.classList.remove('enhanced');
    
    const spinner = overlay.querySelector('.loading-spinner');
    spinner.classList.remove('enhanced');
    
    currentLoadingSteps = [];
}

// ========================================
// SISTEMA DE CACHE PARA USO AO VIVO
// ========================================

// Cache de projetos carregados
const projectCache = {
    projects: new Map(),
    maxSize: 5,
    
    async set(projectId, projectData) {
        if (this.projects.size >= this.maxSize) {
            const firstKey = this.projects.keys().next().value;
            this.projects.delete(firstKey);
            console.log(`🗑️ Cache: removido projeto ${firstKey}`);
        }
        
        this.projects.set(projectId, {
            data: projectData,
            timestamp: Date.now()
        });
        
        console.log(`💾 Cache: projeto ${projectId} salvo (${this.projects.size}/${this.maxSize})`);
    },
    
    get(projectId) {
        const cached = this.projects.get(projectId);
        if (cached) {
            console.log(`⚡ Cache HIT: projeto ${projectId}!`);
            return cached.data;
        }
        console.log(`❌ Cache MISS: projeto ${projectId}`);
        return null;
    },
    
    has(projectId) {
        return this.projects.has(projectId);
    },
    
    clear() {
        this.projects.clear();
        console.log('🗑️ Cache limpo');
    }
};

// Sistema de pré-carregamento
const preloadQueue = {
    queue: [],
    isPreloading: false,
    
    add(projectId) {
        if (!this.queue.includes(projectId) && !projectCache.has(projectId)) {
            this.queue.push(projectId);
            console.log(`📥 Preload: adicionado projeto ${projectId}`);
            this.processQueue();
        }
    },
    
    async processQueue() {
        if (this.isPreloading || this.queue.length === 0) return;
        
        this.isPreloading = true;
        const projectId = this.queue.shift();
        
        try {
            const project = state.savedProjects.find(p => p.id === projectId);
            if (project && project.source === 'drive') {
                console.log(`🔄 Preload: carregando projeto ${projectId}...`);
                await preloadProjectFromDrive(project);
            }
        } catch (err) {
            console.error(`❌ Preload falhou:`, err);
        }
        
        this.isPreloading = false;
        
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 1000);
        }
    }
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAudioContext();
    verifyAudioStereo(); // NOVA LINHA
    initializeApp();
    setupEventListeners();
    setupKeyboardShortcuts();
    checkFileSystemAPISupport();
    loadLibraryPath();
    render();
    startWaveformAnimation();
    startVUMeters();
});

function initializeAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGainNode = audioContext.createGain();
    masterGainNode.connect(audioContext.destination);
    updateMasterGain();
}

// NOVA FUNÇÃO - Adicione aqui
async function verifyAudioStereo() {
    // Verifica se o contexto de áudio suporta estéreo
    const channelCount = audioContext.destination.channelCount;
    const maxChannels = audioContext.destination.maxChannelCount;
    
    console.log(`🔊 Audio Context Info:`);
    console.log(`   - Channels: ${channelCount}`);
    console.log(`   - Max Channels: ${maxChannels}`);
    console.log(`   - Sample Rate: ${audioContext.sampleRate}Hz`);
    
    if (channelCount < 2) {
        console.warn('⚠️ Sistema em MONO! O pan pode não funcionar corretamente.');
        return false;
    }
    
    console.log('✅ Sistema configurado para ESTÉREO!');
    return true;
}

function updateMasterGain() {
    if (masterGainNode) {
        const targetValue = state.masterMute ? 0 : state.masterVolume / 100;
        masterGainNode.gain.setValueAtTime(targetValue, audioContext.currentTime);
    }
}

async function initializeApp() {
    lucide.createIcons();
    
// NOVO: Carrega Google Drive API
await loadGoogleAPI();

// Tenta restaurar sessão
const config = loadLibraryConfig();
if (config.googleAccessToken) {
    googleAccessToken = config.googleAccessToken;
    const isValid = await validateToken();
    if (isValid) {
        gapi.client.setToken({ access_token: googleAccessToken });
        await handleGoogleSignIn();
    } else {
        // Token expirado
        googleAccessToken = null;
        config.googleAccessToken = null;
        config.storageMode = 'local';
        saveLibraryConfig(config);
    }
}
    
    if (config.firstRun) {
        // Primeiro acesso - mostra onboarding
        isFirstRun = true;
        await showOnboardingModal();
    } else {
        // Já configurou - tenta restaurar acesso à pasta
        isFirstRun = false;
        if (config.libraryPath) {
            state.libraryPath = config.libraryPath;
            
            // Tenta recuperar handle do IndexedDB
            if (supportsFileSystem) {
                showLoadingOverlay();
                updateLoadingProgress(1, 1, 'Carregando biblioteca...');
                
                try {
                    libraryFolderHandle = await loadHandleFromIndexedDB();
                    
                    if (libraryFolderHandle) {
                        // Verifica/pede permissão
                        const hasPermission = await verifyPermission(libraryFolderHandle);
                        
                        if (hasPermission) {
                            await loadProjectsFromLibrary();
                        } else {
                            console.log('⚠️ Sem permissão para acessar pasta');
                        }
                    } else {
                        console.log('ℹ️ Nenhum handle salvo. Usuário pode selecionar pasta nas Settings.');
                    }
                } catch (err) {
                    console.error('Erro ao restaurar biblioteca:', err);
                }
                
                hideLoadingOverlay();
            }
        }
        
        // NOVO: Carrega projetos do localStorage (mobile/importados)
        const localProjects = loadProjectsFromLocalStorage();
        if (localProjects.length > 0) {
            // Mescla com projetos da biblioteca (evita duplicatas)
            localProjects.forEach(lp => {
                const exists = state.savedProjects.find(p => p.id === lp.id);
                if (!exists) {
                    state.savedProjects.push(lp);
                }
            });
            console.log(`✅ Total: ${state.savedProjects.length} projeto(s) disponíveis`);
        }
    }
}
// NOVA FUNÇÃO - Adicione logo após initializeApp()
function loadLibraryConfig() {
    try {
        const saved = localStorage.getItem('multitrack_library_config');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (err) {
        console.error('Erro ao carregar config:', err);
    }
    
    // Configuração padrão
    return {
        firstRun: true,
        libraryPath: null,
        theme: 'dark',
        language: 'pt-BR'
    };
}

// ========================================
// GOOGLE DRIVE API INTEGRATION - VERSÃO CORRIGIDA
// ========================================

async function loadGoogleAPI() {
    return new Promise((resolve) => {
        console.log('🔄 Carregando Google API...');
        
        // Carrega Google Identity Services (NOVO)
        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.onload = () => {
            console.log('✅ Google Identity Services carregada');
            
            // Carrega GAPI
            const gapiScript = document.createElement('script');
            gapiScript.src = 'https://apis.google.com/js/api.js';
            gapiScript.onload = () => {
                console.log('✅ GAPI carregada');
                
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: GOOGLE_API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                        });
                        console.log('✅ Google Drive API inicializada');
                        resolve();
                    } catch (err) {
                        console.error('❌ Erro ao inicializar GAPI:', err);
                        resolve();
                    }
                });
            };
            gapiScript.onerror = () => {
                console.error('❌ Erro ao carregar GAPI');
                resolve();
            };
            document.head.appendChild(gapiScript);
        };
        gisScript.onerror = () => {
            console.error('❌ Erro ao carregar GIS');
            resolve();
        };
        document.head.appendChild(gisScript);
    });
}

// NOVA VERSÃO - Usa método de redirect ao invés de popup
async function connectGoogleDrive() {
    try {
        showLoadingOverlay();
        updateLoadingProgress(1, 1, 'Conectando ao Google Drive...');
        
        // Verifica se já está conectado
        if (state.googleDriveConnected && googleAccessToken) {
            const isValid = await validateToken();
            if (isValid) {
                hideLoadingOverlay();
                showAlert('✅ Já conectado ao Google Drive!\n\n📧 ' + state.googleDriveEmail);
                return;
            }
        }
        
        console.log('🔐 Iniciando autenticação Google...');
        
        // Cliente OAuth2 com Token (NOVO MÉTODO)
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            callback: async (response) => {
                if (response.error) {
                    console.error('❌ Erro OAuth:', response);
                    hideLoadingOverlay();
                    showAlert('❌ Erro na autenticação:\n\n' + response.error);
                    return;
                }
                
                console.log('✅ Token recebido');
                googleAccessToken = response.access_token;
                
                // Define token no GAPI
                gapi.client.setToken({
                    access_token: googleAccessToken
                });
                
                // Continua o processo
                await handleGoogleSignIn();
            },
        });
        
        // Solicita token
        tokenClient.requestAccessToken({ prompt: 'consent' });
        
    } catch (err) {
        console.error('❌ Erro ao conectar:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao conectar:\n\n' + err.message);
    }
}

// NOVA FUNÇÃO - Valida token existente
async function validateToken() {
    if (!googleAccessToken) return false;
    
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + googleAccessToken);
        return response.ok;
    } catch {
        return false;
    }
}


// Função mantida, mas com validação melhorada
async function handleGoogleSignIn() {
    try {
        showLoadingOverlay();
        updateLoadingProgress(1, 1, 'Conectando ao Google Drive...');
        
        if (!googleAccessToken) {
            throw new Error('Token não disponível');
        }
        
        // NOVO: Usa a API do Google People ao invés de OAuth2
        let userInfo;
        
        try {
            // Tenta via People API
            const response = await fetch('https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses', {
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                userInfo = {
                    email: data.emailAddresses?.[0]?.value || 'usuario@gmail.com'
                };
            } else {
                // Fallback: usa gapi
                await gapi.client.load('oauth2', 'v2');
                const gapiResponse = await gapi.client.oauth2.userinfo.get();
                userInfo = {
                    email: gapiResponse.result.email
                };
            }
        } catch (err) {
            console.warn('⚠️ Erro ao obter email, usando fallback:', err);
            // Fallback final: pede pro usuário informar
            const email = await showPrompt('Digite seu email do Google:', 'seu@gmail.com');
            if (!email) {
                hideLoadingOverlay();
                return;
            }
            userInfo = { email: email };
        }
        
        state.googleDriveConnected = true;
        state.googleDriveEmail = userInfo.email;
        state.storageMode = 'drive';
        
        // Salva configuração
        const config = loadLibraryConfig();
        config.storageMode = 'drive';
        config.googleEmail = state.googleDriveEmail;
        config.googleAccessToken = googleAccessToken;
        saveLibraryConfig(config);
        
        // Cria/obtém pasta "MultiTrack" no Drive
        await ensureMultiTrackFolder();
        
        // Carrega projetos do Drive
        await loadProjectsFromDrive();
        
        hideLoadingOverlay();
        showAlert(`✅ Conectado ao Google Drive!\n\n📧 ${state.googleDriveEmail}\n\nSeus projetos serão salvos na nuvem.`);
        render();
        
        console.log('✅ Google Drive conectado:', state.googleDriveEmail);
        
    } catch (err) {
        console.error('❌ Erro ao obter informações do usuário:', err);
        hideLoadingOverlay();
        
        showAlert(
            '❌ Erro ao conectar.\n\n' +
            'Tente reconectar ou verifique as permissões.'
        );
    }
}

// RESTO DAS FUNÇÕES (disconnectGoogleDrive, ensureMultiTrackFolder, etc.) 
// permanecem iguais...

async function disconnectGoogleDrive() {
    const confirmed = await showConfirm(
        '⚠️ Desconectar do Google Drive?\n\n' +
        'Seus projetos na nuvem não serão apagados.\n' +
        'Você pode reconectar depois.'
    );
    
    if (!confirmed) return;
    
    try {
        // Revoga token
        if (googleAccessToken) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${googleAccessToken}`, {
                method: 'POST'
            });
        }
        
        // Limpa token do GAPI
        if (window.gapi?.client) {
            gapi.client.setToken(null);
        }
        
        googleAccessToken = null;
        googleDriveFolderId = null;
        state.googleDriveConnected = false;
        state.googleDriveEmail = null;
        state.storageMode = 'local';
        
        // Remove projetos do Drive da lista
        state.savedProjects = state.savedProjects.filter(p => p.source !== 'drive');
        
        // Atualiza config
        const config = loadLibraryConfig();
        config.storageMode = 'local';
        config.googleEmail = null;
        saveLibraryConfig(config);
        
        showAlert('✅ Desconectado do Google Drive');
        render();
        
    } catch (err) {
        console.error('❌ Erro ao desconectar:', err);
        showAlert('❌ Erro ao desconectar');
    }
}

async function ensureMultiTrackFolder() {
    try {
        // Busca pasta "MultiTrack"
        const response = await gapi.client.drive.files.list({
            q: "name='MultiTrack' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        if (response.result.files.length > 0) {
            // Pasta já existe
            googleDriveFolderId = response.result.files[0].id;
            console.log('✅ Pasta MultiTrack encontrada:', googleDriveFolderId);
        } else {
            // Cria nova pasta
            const fileMetadata = {
                name: 'MultiTrack',
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            const folder = await gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            
            googleDriveFolderId = folder.result.id;
            console.log('✅ Pasta MultiTrack criada:', googleDriveFolderId);
        }
        
    } catch (err) {
        console.error('❌ Erro ao criar pasta MultiTrack:', err);
        throw err;
    }
}

async function loadProjectsFromDrive() {
    if (!googleDriveFolderId) return;
    
    try {
        showLoadingOverlay();
        updateLoadingProgress(1, 1, 'Carregando projetos da nuvem...');
        
        // Lista todas as pastas de projetos
        const response = await gapi.client.drive.files.list({
            q: `'${googleDriveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name, modifiedTime)',
            orderBy: 'modifiedTime desc'
        });
        
        const driveProjects = [];
        
        for (const folder of response.result.files) {
            try {
                // Busca projeto.json dentro da pasta
                const jsonSearch = await gapi.client.drive.files.list({
                    q: `name='projeto.json' and '${folder.id}' in parents and trashed=false`,
                    fields: 'files(id)'
                });
                
                if (jsonSearch.result.files.length === 0) continue;
                
                // Baixa projeto.json
                const jsonContent = await gapi.client.drive.files.get({
                    fileId: jsonSearch.result.files[0].id,
                    alt: 'media'
                });
                
                const projectData = JSON.parse(jsonContent.body);
                projectData.source = 'drive';
                projectData.driveFileId = folder.id;
                projectData.updatedAt = new Date(folder.modifiedTime).toLocaleString('pt-BR');
                
                driveProjects.push(projectData);
                
            } catch (err) {
                console.error(`Erro ao carregar ${folder.name}:`, err);
            }
        }
        
        state.savedProjects = state.savedProjects.filter(p => p.source !== 'drive');
        state.savedProjects.push(...driveProjects);
        
        state.lastSyncTime = new Date().toLocaleString('pt-BR');
        
        hideLoadingOverlay();
        console.log(`✅ ${driveProjects.length} projeto(s) carregado(s) do Drive`);
        
    } catch (err) {
        console.error('❌ Erro ao carregar projetos:', err);
        hideLoadingOverlay();
    }
}
// ========================================
// SAVE PROJECT TO DRIVE - VERSÃO INTELIGENTE
// Atualiza apenas metadados se áudios não mudaram
// ========================================

async function saveProjectToDrive(projectData) {
    if (!googleDriveFolderId) {
        throw new Error('Pasta MultiTrack não encontrada');
    }
    
    try {
        showLoadingOverlay();
        
        console.log('💾 ========== SALVANDO NO DRIVE ==========');
        console.log('   - Projeto:', projectData.name);
        console.log('   - Tracks:', projectData.tracks.length);
        
        // PASSO 1: Cria/obtém pasta do projeto
        updateLoadingProgress(1, 2, 'Verificando pasta...');
        
        const projectFolderName = `${projectData.name.replace(/[^a-z0-9]/gi, '_')}_${projectData.id}`;
        let projectFolderId = projectData.driveProjectFolderId;
        
        if (!projectFolderId) {
            // Busca pasta existente
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${projectFolderName}' and '${googleDriveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                spaces: 'drive',
                fields: 'files(id)'
            });
            
            if (searchResponse.result.files.length > 0) {
                projectFolderId = searchResponse.result.files[0].id;
                console.log('   ✅ Pasta encontrada:', projectFolderId);
            } else {
                // Cria nova pasta
                const createResponse = await gapi.client.drive.files.create({
                    resource: {
                        name: projectFolderName,
                        mimeType: 'application/vnd.google-apps.folder',
                        parents: [googleDriveFolderId]
                    },
                    fields: 'id'
                });
                projectFolderId = createResponse.result.id;
                console.log('   ✅ Nova pasta criada:', projectFolderId);
            }
        }
        
        // PASSO 2: Verifica se áudios já existem
        updateLoadingProgress(2, 2, 'Salvando metadados...');
        
        console.log('   📥 Verificando áudios existentes...');
        const existingFiles = await gapi.client.drive.files.list({
            q: `'${projectFolderId}' in parents and trashed=false`,
            fields: 'files(id, name)'
        });
        
        const existingFileMap = new Map();
        existingFiles.result.files.forEach(f => {
            existingFileMap.set(f.name, f.id);
        });
        
        console.log(`   ✅ Encontrados ${existingFileMap.size} arquivo(s) existentes`);
        
        // PASSO 3: Prepara metadados (SEM audioData)
        const tracksMetadata = projectData.tracks.map(t => {
            const audioFilename = `track_${t.id}_${t.name.replace(/[^a-z0-9]/gi, '_')}.mp3`;
            const existingFileId = existingFileMap.get(audioFilename);
            
            return {
                id: t.id,
                name: t.name,
                volume: t.volume,
                pan: t.pan,
                solo: t.solo,
                mute: t.mute,
                color: t.color,
                driveFileId: existingFileId || null,
                filename: audioFilename
            };
        });
        
        const projectMetadata = {
            id: projectData.id,
            name: projectData.name,
            tracks: tracksMetadata,
            markers: projectData.markers,
            markerShortcuts: projectData.markerShortcuts,
            duration: projectData.duration,
            masterVolume: projectData.masterVolume,
            masterMute: projectData.masterMute,
            bpm: projectData.bpm,
            key: projectData.key,
            fadeInTime: projectData.fadeInTime,
            fadeOutTime: projectData.fadeOutTime,
            createdAt: projectData.createdAt,
            updatedAt: new Date().toLocaleString('pt-BR'),
            driveProjectFolderId: projectFolderId
        };
        
        // PASSO 4: Salva projeto.json usando GAPI (mais confiável)
        console.log('   💾 Salvando projeto.json...');
        
        const jsonBlob = new Blob([JSON.stringify(projectMetadata, null, 2)], { type: 'application/json' });
        const reader = new FileReader();
        
        const base64Data = await new Promise((resolve) => {
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(jsonBlob);
        });
        
        // Busca projeto.json existente
        const searchJson = await gapi.client.drive.files.list({
            q: `name='projeto.json' and '${projectFolderId}' in parents and trashed=false`,
            fields: 'files(id)'
        });
        
        if (searchJson.result.files.length > 0) {
            // Atualiza usando GAPI
            const fileId = searchJson.result.files[0].id;
            console.log('   📝 Atualizando projeto.json existente...');
            
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: {
                    uploadType: 'media'
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(projectMetadata, null, 2)
            });
            
            console.log('   ✅ projeto.json atualizado!');
            
        } else {
            // Cria novo
            console.log('   📝 Criando novo projeto.json...');
            
            await gapi.client.drive.files.create({
                resource: {
                    name: 'projeto.json',
                    parents: [projectFolderId],
                    mimeType: 'application/json'
                },
                media: {
                    mimeType: 'application/json',
                    body: JSON.stringify(projectMetadata, null, 2)
                },
                fields: 'id'
            });
            
            console.log('   ✅ projeto.json criado!');
        }
        
        projectMetadata.source = 'drive';
        projectMetadata.driveFileId = projectFolderId;
        
        // Atualiza cache
        if (projectCache.has(projectData.id)) {
            const cached = projectCache.get(projectData.id);
            // Mantém os arquivos em cache, atualiza só metadados
            cached.markers = projectMetadata.markers;
            cached.markerShortcuts = projectMetadata.markerShortcuts;
            cached.masterVolume = projectMetadata.masterVolume;
            cached.masterMute = projectMetadata.masterMute;
            cached.bpm = projectMetadata.bpm;
            cached.key = projectMetadata.key;
            cached.updatedAt = projectMetadata.updatedAt;
            
            // Atualiza volumes/pans dos tracks
            cached.tracks.forEach(ct => {
                const updated = tracksMetadata.find(t => t.id === ct.id);
                if (updated) {
                    ct.volume = updated.volume;
                    ct.pan = updated.pan;
                    ct.solo = updated.solo;
                    ct.mute = updated.mute;
                }
            });
            
            console.log('   💾 Cache atualizado com novos metadados');
        }
        
        state.lastSyncTime = new Date().toLocaleString('pt-BR');
        
        hideLoadingOverlay();
        console.log('✅ ========== PROJETO SALVO (METADATA-ONLY) ==========');
        console.log('   - Tempo: <1 segundo');
        console.log('   - Áudios: não reenviados (já estão no Drive)');
        
        return projectMetadata;
        
    } catch (err) {
        hideLoadingOverlay();
        console.error('❌ ========== ERRO AO SALVAR ==========');
        console.error('   - Erro:', err);
        console.error('   - Stack:', err.stack);
        throw err;
    }
}

// ========================================
// PRELOAD DE PROJETO (BACKGROUND)
// ========================================

// ========================================
// PRELOAD DE PROJETO (BACKGROUND) - VERSÃO CORRIGIDA
// ========================================

async function preloadProjectFromDrive(project) {
    if (!project.driveFileId || !state.googleDriveConnected) {
        console.warn('⚠️ Preload cancelado: sem driveFileId ou não conectado');
        return;
    }
    
    try {
        console.log(`⚡ ========== PRELOAD: ${project.name} ==========`);
        
        // 1. Busca projeto.json
        console.log('   📥 Passo 1: Buscando projeto.json...');
        const jsonSearch = await gapi.client.drive.files.list({
            q: `name='projeto.json' and '${project.driveFileId}' in parents and trashed=false`,
            fields: 'files(id)'
        });
        
        if (jsonSearch.result.files.length === 0) {
            console.error('   ❌ projeto.json não encontrado');
            return;
        }
        
        console.log('   ✅ projeto.json encontrado');
        
        // 2. Baixa projeto.json
        console.log('   📥 Passo 2: Baixando projeto.json...');
        const jsonContent = await gapi.client.drive.files.get({
            fileId: jsonSearch.result.files[0].id,
            alt: 'media'
        });
        
        const projectData = JSON.parse(jsonContent.body);
        console.log(`   ✅ Projeto parseado (${projectData.tracks.length} tracks)`);
        
        // 3. Baixa TODOS os áudios em paralelo
        console.log('   📥 Passo 3: Baixando áudios em paralelo...');
        
        const audioPromises = projectData.tracks.map(async (trackData, index) => {
            if (!trackData.driveFileId) {
                console.warn(`   ⚠️ Track ${trackData.name} sem driveFileId`);
                return null;
            }
            
            try {
                console.log(`      📥 [${index + 1}/${projectData.tracks.length}] ${trackData.name}...`);
                
                // MÉTODO 1: Tenta com GAPI primeiro (mais confiável que fetch)
                try {
                    const audioResponse = await gapi.client.drive.files.get({
                        fileId: trackData.driveFileId,
                        alt: 'media'
                    });
                    
                    // Converte GAPI response (binary string) para Blob
                    const binaryString = audioResponse.body;
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    
                    // Conversão otimizada em batches
                    const batchSize = 1024 * 64; // 64KB por vez
                    for (let i = 0; i < len; i += batchSize) {
                        const end = Math.min(i + batchSize, len);
                        for (let j = i; j < end; j++) {
                            bytes[j] = binaryString.charCodeAt(j);
                        }
                    }
                    
                    const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
                    const audioFile = new File(
                        [audioBlob], 
                        trackData.filename || 'track.mp3', 
                        { type: 'audio/mpeg' }
                    );
                    
                    console.log(`      ✅ ${trackData.name} (GAPI) (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`);
                    
                    return { trackData, audioFile };
                    
                } catch (gapiErr) {
                    // FALLBACK: Tenta fetch se GAPI falhar
                    console.log(`      ⚠️ GAPI falhou para ${trackData.name}, tentando fetch...`);
                    
                    const fetchResponse = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${trackData.driveFileId}?alt=media`,
                        {
                            headers: {
                                'Authorization': `Bearer ${googleAccessToken}`
                            }
                        }
                    );
                    
                    if (!fetchResponse.ok) {
                        throw new Error(`Fetch falhou: ${fetchResponse.status}`);
                    }
                    
                    const audioBlob = await fetchResponse.blob();
                    const audioFile = new File(
                        [audioBlob], 
                        trackData.filename || 'track.mp3', 
                        { type: 'audio/mpeg' }
                    );
                    
                    console.log(`      ✅ ${trackData.name} (Fetch) (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`);
                    
                    return { trackData, audioFile };
                }
                
            } catch (err) {
                console.error(`      ❌ Preload erro: ${trackData.name}`, err.message);
                return null;
            }
        });
        
        const downloadedTracks = await Promise.all(audioPromises);
        const validTracks = downloadedTracks.filter(t => t !== null);
        
        console.log(`   ✅ Downloads concluídos: ${validTracks.length}/${projectData.tracks.length}`);
        
        // 4. Salva no cache COM os arquivos
        projectData.cachedAudioFiles = validTracks;
        projectData.source = 'drive';
        projectData.driveFileId = project.driveFileId;
        
        await projectCache.set(project.id, projectData);
        
        console.log(`✅ ========== PRELOAD OK: ${project.name} ==========`);
        console.log(`   - Tracks em cache: ${validTracks.length}`);
        
    } catch (err) {
        console.error(`❌ ========== PRELOAD FALHOU: ${project.name} ==========`);
        console.error('   - Erro:', err);
        console.error('   - Stack:', err.stack);
    }
}

async function deleteProjectFromDrive(fileId) {
    try {
        await gapi.client.drive.files.delete({
            fileId: fileId
        });
        
        console.log('✅ Projeto deletado do Drive:', fileId);
        
    } catch (err) {
        console.error('❌ Erro ao deletar do Drive:', err);
        throw err;
    }
}


// ========================================
// INDEXEDDB COM FALLBACK PARA LOCALSTORAGE
// ========================================

async function saveHandleToIndexedDB(handle) {
    try {
        const db = await openDatabase();
        const tx = db.transaction('fileHandles', 'readwrite');
        const store = tx.objectStore('fileHandles');
        
        await store.put({
            id: 'libraryFolder',
            handle: handle
        });
        
        await tx.done;
        console.log('✅ Handle salvo no IndexedDB');
        return true;
    } catch (err) {
        console.warn('⚠️ IndexedDB bloqueado, usando fallback:', err);
        
        // FALLBACK: Salva apenas o nome da pasta
        try {
            localStorage.setItem('multitrack_folder_name', handle.name);
            console.log('✅ Nome da pasta salvo no localStorage (fallback)');
            return true;
        } catch (lsErr) {
            console.error('❌ Todos os storages bloqueados:', lsErr);
            return false;
        }
    }
}

async function loadHandleFromIndexedDB() {
    try {
        const db = await openDatabase();
        const tx = db.transaction('fileHandles', 'readonly');
        const store = tx.objectStore('fileHandles');
        
        const result = await store.get('libraryFolder');
        
        if (result && result.handle) {
            console.log('✅ Handle recuperado do IndexedDB');
            return result.handle;
        }
        
        console.log('ℹ️ Nenhum handle no IndexedDB');
        return null;
    } catch (err) {
        console.warn('⚠️ IndexedDB bloqueado:', err);
        
        // FALLBACK: Não consegue recuperar handle, apenas avisa
        const folderName = localStorage.getItem('multitrack_folder_name');
        if (folderName) {
            console.log(`ℹ️ Pasta salva: ${folderName} (precisará selecionar novamente)`);
        }
        return null;
    }
}


async function verifyPermission(handle) {
    if (!handle) return false;
    
    const options = { mode: 'readwrite' };
    
    try {
        // Checa se já tem permissão
        if (await handle.queryPermission(options) === 'granted') {
            console.log('✅ Permissão já concedida');
            return true;
        }
        
        // Pede permissão ao usuário
        console.log('🔐 Pedindo permissão...');
        if (await handle.requestPermission(options) === 'granted') {
            console.log('✅ Permissão concedida');
            return true;
        }
        
        console.warn('⚠️ Permissão negada');
        return false;
    } catch (err) {
        console.error('❌ Erro ao verificar permissão:', err);
        return false;
    }
}

async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MultiTrackProDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('fileHandles')) {
                db.createObjectStore('fileHandles', { keyPath: 'id' });
            }
        };
    });
}


// NOVA FUNÇÃO - Adicione logo após loadLibraryConfig()
function saveLibraryConfig(config) {
    try {
        localStorage.setItem('multitrack_library_config', JSON.stringify(config));
        console.log('✅ Configuração salva');
    } catch (err) {
        console.error('❌ Erro ao salvar config:', err);
    }
}
async function showOnboardingModal() {
    return new Promise(async (resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h3 class="modal-title">🎵 Bem-vindo ao MultiTrack Pro!</h3>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">
                        Para começar, escolha onde seus projetos serão salvos:
                    </p>
                    
                    <div style="background: #1f2937; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <p style="font-size: 0.875rem; color: #9ca3af; margin: 0;">
                            📁 <strong>Recomendado:</strong><br>
                            • Android: Música/MultiTrack<br>
                            • PC: Documentos/MultiTrack
                        </p>
                    </div>
                    
                    <p style="font-size: 0.875rem; color: #9ca3af;">
                        ℹ️ Você pode mudar depois nas Configurações
                    </p>
                </div>
                <div class="modal-buttons">
                    ${supportsFileSystem ? `
                        <button class="modal-btn modal-btn-primary" data-action="select-folder">
                            <i data-lucide="folder-plus"></i>
                            Selecionar Pasta
                        </button>
                    ` : `
                        <button class="modal-btn modal-btn-primary" data-action="continue">
                            Continuar
                        </button>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        lucide.createIcons();

        if (supportsFileSystem) {
            const selectBtn = overlay.querySelector('[data-action="select-folder"]');
            selectBtn.addEventListener('click', async () => {
                const success = await setupLibraryFolder();
                if (success) {
                    overlay.remove();
                    resolve(true);
                }
            });
        } else {
            const continueBtn = overlay.querySelector('[data-action="continue"]');
            continueBtn.addEventListener('click', () => {
                // Mobile: não precisa selecionar pasta (usa download/upload)
                const config = {
                    firstRun: false,
                    libraryPath: 'Mobile (Download/Upload)',
                    theme: 'dark',
                    language: 'pt-BR'
                };
                saveLibraryConfig(config);
                overlay.remove();
                
                showAlert('✅ Configuração concluída!\n\n📱 No celular, use:\n• "Salvar" para baixar projetos (.mtp)\n• "Importar .mtp" para carregar');
                resolve(true);
            });
        }
    });
}

// NOVA FUNÇÃO - Configura pasta da biblioteca
async function setupLibraryFolder() {
    if (!supportsFileSystem) {
        return false;
    }

    try {
        // Tenta abrir seletor de pasta
        libraryFolderHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });

        state.libraryPath = libraryFolderHandle.name;
        
        // ← NOVO: Salva handle no IndexedDB
        await saveHandleToIndexedDB(libraryFolderHandle);
        
        // Salva configuração
        const config = {
            firstRun: false,
            libraryPath: state.libraryPath,
            theme: 'dark',
            language: 'pt-BR'
        };
        saveLibraryConfig(config);

        // Carrega projetos existentes (se houver)
        await loadProjectsFromLibrary();

        showAlert(`✅ Biblioteca configurada!\n\n📁 Pasta: ${state.libraryPath}\n\nSeus projetos serão salvos aqui.`);
        render();
        return true;

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Erro ao selecionar pasta:', err);
            showAlert('❌ Erro ao selecionar pasta. Tente novamente.');
        }
        return false;
    }
}

// NOVA FUNÇÃO - Carrega projetos da biblioteca
async function loadProjectsFromLibrary() {
    if (!libraryFolderHandle) {
        // Tenta reabrir a pasta (se usuário já deu permissão antes)
        return;
    }

    showLoadingOverlay();
    updateLoadingProgress(0, 1, 'Carregando biblioteca...');

    const projects = [];

    try {
        // Percorre todas as pastas na biblioteca
        for await (const entry of libraryFolderHandle.values()) {
            if (entry.kind === 'directory') {
                try {
                    const projectFolder = await libraryFolderHandle.getDirectoryHandle(entry.name);
                    
                    // Tenta ler projeto.json
                    const fileHandle = await projectFolder.getFileHandle('projeto.json');
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const projectData = JSON.parse(text);

                    projectData.folderName = entry.name;
                    projectData.source = 'library';
                    projects.push(projectData);

                } catch (err) {
                    console.log(`Pasta "${entry.name}" não contém projeto válido`);
                }
            }
        }

        state.savedProjects = projects;
        console.log(`✅ ${projects.length} projeto(s) carregado(s)`);

    } catch (err) {
        console.error('Erro ao carregar biblioteca:', err);
    }

    hideLoadingOverlay();
    render();
}

// ========================================
// LOCALSTORAGE FALLBACK (MOBILE/IMPORTADOS)
// ========================================

function saveProjectsToLocalStorage() {
    try {
        // Filtra apenas projetos com audioData (podem ser salvos no localStorage)
        const projectsToSave = state.savedProjects.filter(p => 
            p.source === 'localStorage' || 
            p.source === 'mobile' ||
            p.source === 'imported' ||
            (p.tracks && p.tracks.length > 0 && p.tracks[0].audioData)
        );
        
        if (projectsToSave.length > 0) {
            localStorage.setItem('multitrack_projects', JSON.stringify(projectsToSave));
            console.log(`✅ ${projectsToSave.length} projeto(s) salvo(s) no localStorage`);
        }
    } catch (err) {
        console.warn('⚠️ Erro ao salvar no localStorage:', err);
    }
}

function loadProjectsFromLocalStorage() {
    try {
        const saved = localStorage.getItem('multitrack_projects');
        if (saved) {
            const projects = JSON.parse(saved);
            console.log(`✅ ${projects.length} projeto(s) carregado(s) do localStorage`);
            return projects;
        }
    } catch (err) {
        console.error('❌ Erro ao carregar do localStorage:', err);
    }
    return [];
}
// ========================================
// FILE SYSTEM API SUPPORT
// ========================================

function checkFileSystemAPISupport() {
    console.log('🔍 Verificando File System API:');
    console.log('   - showDirectoryPicker exists?', 'showDirectoryPicker' in window);
    console.log('   - isMobile?', isMobile);
    console.log('   - isIOS?', isIOS);
    console.log('   - supportsFileSystem?', supportsFileSystem);
    
    if (supportsFileSystem) {
        console.log('✅ File System Access API suportada! (Modo Desktop)');
    } else {
        if (isIOS) {
            console.log('📱 iOS detectado - usando fallback');
        } else if (!('showDirectoryPicker' in window)) {
            console.log('⚠️ Navegador não suporta File System API');
        } else {
            console.log('📱 Modo Mobile/Fallback ativado');
        }
    }
}

function loadLibraryPath() {
    const savedPath = localStorage.getItem('libraryPath');
    if (savedPath) {
        state.libraryPath = savedPath;
    }
}

async function selectProjectsLibrary() {
    // Chama a mesma função de onboarding
    const success = await setupLibraryFolder();
    return success;
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.play-btn')) togglePlay();
        if (e.target.closest('.stop-btn')) stopWithFade();
        if (e.target.closest('.skip-back-btn')) skipBackward();
        if (e.target.closest('.skip-forward-btn')) skipForward();
        if (e.target.closest('.undo-btn')) undo();
        if (e.target.closest('.redo-btn')) redo();
        
        if (e.target.closest('.load-folder-library-btn')) loadFolderToLibrary();
        if (e.target.closest('.track-rename-btn')) {
            const btn = e.target.closest('.track-rename-btn');
            renameTrack(parseFloat(btn.dataset.trackId));
        }
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
            state.activeTab = tabBtn.dataset.tab;
            render();
        }
        
        const navBtn = e.target.closest('.nav-btn');
        if (navBtn) {
            state.activeTab = navBtn.dataset.tab;
            render();
        }
        
        if (e.target.closest('.import-tracks-btn')) document.getElementById('fileInput').click();
        if (e.target.closest('.import-folder-btn')) document.getElementById('folderInput').click();
        
        if (e.target.closest('.save-btn')) {
            console.log('🔘 Botão Salvar clicado!');
            saveCurrentProject();
        }
        if (e.target.closest('.save-as-btn')) {
            console.log('🔘 Botão Salvar Como clicado!');
            saveProjectAs();
        }
        
        if (e.target.closest('.add-marker-btn')) addMarker();
        if (e.target.closest('.export-btn')) exportMixdown();
        if (e.target.closest('.fade-config-btn')) configureFade();
        if (e.target.closest('.import-project-btn')) document.getElementById('projectImportInput').click();
        if (e.target.closest('.select-library-btn')) selectProjectsLibrary();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('folderInput').addEventListener('change', handleFolderUpload);
    document.getElementById('projectImportInput').addEventListener('change', handleProjectImport);
    document.getElementById('multipleProjectImportInput').addEventListener('change', handleMultipleProjectImport);
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Space - Play/Pause
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        }

        // Arrow Keys - Seek
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            seekToTime(Math.max(0, state.currentTime - 5));
        }

        if (e.code === 'ArrowRight') {
            e.preventDefault();
            seekToTime(Math.min(state.duration, state.currentTime + 5));
        }

        // Number Keys - Jump to markers
        if (e.code.startsWith('Digit') && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            const num = parseInt(e.code.replace('Digit', ''));
            const marker = state.markers.find(m => state.markerShortcuts[m.id] === num);
            if (marker) {
                e.preventDefault();
                seekToMarkerWithPreRoll(marker.time);
            }
        }

        // S - Stop
        if (e.code === 'KeyS' && !e.ctrlKey) {
            e.preventDefault();
            stopWithFade();
        }

        // Ctrl+Z - Undo
        if (e.code === 'KeyZ' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            undo();
        }

        // Ctrl+Y or Ctrl+Shift+Z - Redo
        if ((e.code === 'KeyY' && e.ctrlKey) || (e.code === 'KeyZ' && e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            redo();
        }

        // Ctrl+S - Save
        if (e.code === 'KeyS' && e.ctrlKey) {
            e.preventDefault();
            saveCurrentProject();
        }
    });
}

// ========================================
// UNDO/REDO SYSTEM
// ========================================

function saveToHistory() {
    // Remove future history if we're not at the end
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }

    // Save current state
    const snapshot = {
        tracks: state.tracks.map(t => ({
            id: t.id,
            volume: t.volume,
            pan: t.pan,
            solo: t.solo,
            mute: t.mute
        })),
        masterVolume: state.masterVolume,
        masterMute: state.masterMute,
        markers: JSON.parse(JSON.stringify(state.markers)),
        markerShortcuts: JSON.parse(JSON.stringify(state.markerShortcuts))
    };

    history.push(snapshot);
    
    // Limit history size
    if (history.length > MAX_HISTORY) {
        history.shift();
    } else {
        historyIndex++;
    }

    render();
}

// ========================================
// DETECÇÃO DE MODIFICAÇÕES
// ========================================

function markProjectAsModified() {
    if (!state.currentProject) return;
    
    state.isProjectModified = true;
    render();
}

function markProjectAsSaved() {
    state.isProjectModified = false;
    state.lastSavedState = captureCurrentState();
    render();
}

function captureCurrentState() {
    return {
        tracks: state.tracks.map(t => ({
            id: t.id,
            name: t.name,
            volume: t.volume,
            pan: t.pan,
            solo: t.solo,
            mute: t.mute
        })),
        markers: JSON.parse(JSON.stringify(state.markers)),
        markerShortcuts: JSON.parse(JSON.stringify(state.markerShortcuts)),
        masterVolume: state.masterVolume,
        masterMute: state.masterMute,
        bpm: state.bpm,
        key: state.key
    };
}

function undo() {
    if (historyIndex <= 0) return;

    historyIndex--;
    restoreFromHistory(history[historyIndex]);
}

function redo() {
    if (historyIndex >= history.length - 1) return;

    historyIndex++;
    restoreFromHistory(history[historyIndex]);
}

// ========================================
// RESTORE FROM HISTORY - COM PAN MANUAL
// ========================================
function restoreFromHistory(snapshot) {
    snapshot.tracks.forEach(savedTrack => {
        const track = state.tracks.find(t => t.id === savedTrack.id);
        if (track) {
            track.volume = savedTrack.volume;
            track.pan = savedTrack.pan;
            track.solo = savedTrack.solo;
            track.mute = savedTrack.mute;
            
            if (track.gainNode) {
                track.gainNode.gain.value = track.volume / 100;
            }
            
            // ✅ Pan manual direto
            if (track.leftGain && track.rightGain) {
                const leftGainValue = Math.max(0, 1 - track.pan);
                const rightGainValue = Math.max(0, 1 + track.pan);
                track.leftGain.gain.value = leftGainValue;
                track.rightGain.gain.value = rightGainValue;
            }
        }
    });

    state.masterVolume = snapshot.masterVolume;
    state.masterMute = snapshot.masterMute;
    updateMasterGain();

    state.markers = JSON.parse(JSON.stringify(snapshot.markers));
    state.markerShortcuts = JSON.parse(JSON.stringify(snapshot.markerShortcuts));

    render();
}
// ========================================
// BPM PULSE ANIMATION
// ========================================

function startBPMPulse() {
    if (bpmInterval) clearInterval(bpmInterval);
    const interval = (60 / state.bpm) * 1000;
    bpmInterval = setInterval(() => {
        const playBtn = document.querySelector('.play-btn');
        if (playBtn && state.isPlaying) {
            playBtn.classList.add('bpm-pulse');
            setTimeout(() => playBtn.classList.remove('bpm-pulse'), 100);
        }
    }, interval);
}

function stopBPMPulse() {
    if (bpmInterval) {
        clearInterval(bpmInterval);
        bpmInterval = null;
    }
}
// ========================================
// MULTITRACK PRO - PARTE 2/5
// Playback Controls e File Import
// ========================================

// ========================================
// PLAYBACK CONTROLS
// ========================================

async function togglePlay() {
    if (state.tracks.length === 0) {
        showAlert('Importe tracks primeiro');
        return;
    }

    if (audioContext.state === 'suspended') await audioContext.resume();

    if (state.isPlaying) {
        // Pause
        state.tracks.forEach(track => {
            if (track.audioElement) track.audioElement.pause();
        });
        state.isPlaying = false;
        stopBPMPulse();
    } else {
        // Play with improved sync
        if (state.currentTime >= state.duration) {
            state.currentTime = 0;
        }

        // Apply fade in
        const currentGain = masterGainNode.gain.value;
        const targetGain = state.masterMute ? 0 : state.masterVolume / 100;
        
        masterGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        masterGainNode.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + state.fadeInTime);

        // Sync all tracks to same time using AudioContext time
        const startTime = audioContext.currentTime;
        const playPromises = state.tracks.map(track => {
            if (track.audioElement && !track.mute) {
                track.audioElement.currentTime = state.currentTime;
                return track.audioElement.play().catch(err => console.error('Error playing track:', track.name, err));
            }
            return Promise.resolve();
        });

        await Promise.all(playPromises);
        state.isPlaying = true;
        startBPMPulse();
    }
    render();
}

function stopWithFade() {
    if (!state.isPlaying) return;

    const fadeTime = state.fadeOutTime;
    const currentGain = masterGainNode.gain.value;
    const currentTime = audioContext.currentTime;
    
    masterGainNode.gain.setValueAtTime(currentGain, currentTime);
    masterGainNode.gain.linearRampToValueAtTime(0, currentTime + fadeTime);

    setTimeout(() => {
        state.tracks.forEach(track => {
            if (track.audioElement) {
                track.audioElement.pause();
                track.audioElement.currentTime = 0;
            }
        });
        state.isPlaying = false;
        state.currentTime = 0;
        stopBPMPulse();
        masterGainNode.gain.setValueAtTime(state.masterMute ? 0 : state.masterVolume / 100, audioContext.currentTime);
        render();
    }, fadeTime * 1000);
}

function skipBackward() {
    seekToTime(Math.max(0, state.currentTime - 10));
}

function skipForward() {
    seekToTime(Math.min(state.duration, state.currentTime + 10));
}

function seekToTime(time) {
    state.currentTime = time;
    state.tracks.forEach(track => {
        if (track.audioElement) {
            track.audioElement.currentTime = time;
        }
    });
    render();
}

function seekToMarkerWithPreRoll(markerTime) {
    const targetTime = Math.max(0, markerTime - state.preRollTime);
    seekToTime(targetTime);
    if (!state.isPlaying) togglePlay();
}

function handleWaveformInteraction(e) {
    const container = document.querySelector('.waveform-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    
    seekToTime(percentage * state.duration);
}
// ========================================
// FADE CONFIGURATION
// ========================================

async function configureFade() {
    const result = await showFadeModal();
    if (result) {
        state.fadeInTime = result.fadeIn;
        state.fadeOutTime = result.fadeOut;
        showAlert(`Fade configurado: In ${result.fadeIn}s / Out ${result.fadeOut}s`);
    }
}

function showFadeModal() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">Configurar Fade In/Out</h3>
                <div class="modal-body">
                    <label class="modal-label">Fade In (segundos)</label>
                    <input type="number" class="modal-input" id="fade-in-input" value="${state.fadeInTime}" min="0" max="5" step="0.1">
                    
                    <label class="modal-label">Fade Out (segundos)</label>
                    <input type="number" class="modal-input" id="fade-out-input" value="${state.fadeOutTime}" min="0" max="5" step="0.1">
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="modal-btn modal-btn-primary" data-action="confirm">OK</button>
                </div>
            </div>
        `;

        const fadeInInput = overlay.querySelector('#fade-in-input');
        const fadeOutInput = overlay.querySelector('#fade-out-input');
        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve({
                fadeIn: parseFloat(fadeInInput.value) || 0.5,
                fadeOut: parseFloat(fadeOutInput.value) || 1.5
            });
        });
        
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });

        document.body.appendChild(overlay);
        fadeInInput.focus();
        fadeInInput.select();
    });
}

// ========================================
// FILE UPLOAD HANDLERS
// ========================================

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    await clearCurrentProject();
    await importFiles(files);
    event.target.value = '';
}

async function handleFolderUpload(event) {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('audio/'));
    if (files.length === 0) {
        showAlert('Nenhum arquivo de áudio encontrado na pasta');
        return;
    }
    await clearCurrentProject();
    await importFiles(files);
    event.target.value = '';
}

async function clearCurrentProject() {
    if (state.isPlaying) {
        state.tracks.forEach(track => {
            if (track.audioElement) track.audioElement.pause();
        });
        state.isPlaying = false;
        stopBPMPulse();
    }
    state.tracks = [];
    state.markers = [];
    state.markerShortcuts = {};
    state.currentProject = null;
    state.currentTime = 0;
    state.duration = 180;
    history = [];
    historyIndex = -1;
}

// ========================================
// IMPORT FILES - COM PAN MANUAL
// ========================================
async function importFiles(files) {
    const musicInfo = await showMusicInfoModal();
    if (!musicInfo) return;
    
    state.bpm = musicInfo.bpm;
    state.key = musicInfo.key;

    state.isImporting = true;
    showLoadingOverlay();

    const newTracks = [];
    let maxDuration = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/')) continue;

        updateLoadingProgress(i + 1, files.length, file.name);

        try {
            const audioData = await fileToBase64(file);
            const audioElement = await createAudioElement(file);
            const duration = audioElement.duration;
            maxDuration = Math.max(maxDuration, duration);

            const trackName = file.name.replace(/\.[^/.]+$/, '');
            
            // ✅ AUDIO NODES - PAN MANUAL LINEAR
            const source = audioContext.createMediaElementSource(audioElement);
            const gainNode = audioContext.createGain();
            const splitter = audioContext.createChannelSplitter(2);
            const merger = audioContext.createChannelMerger(2);
            const leftGain = audioContext.createGain();
            const rightGain = audioContext.createGain();
            const analyserNode = audioContext.createAnalyser();

            analyserNode.fftSize = 256;
            analyserNode.smoothingTimeConstant = 0.8;

            // Roteamento
            source.connect(splitter);
            splitter.connect(leftGain, 0);
            splitter.connect(rightGain, 1);
            leftGain.connect(merger, 0, 0);
            rightGain.connect(merger, 0, 1);
            merger.connect(gainNode);
            gainNode.connect(analyserNode);
            analyserNode.connect(masterGainNode);

            const newTrack = {
                id: Date.now() + Math.random() + i,
                name: trackName,
                volume: 75,
                pan: 0,
                solo: false,
                mute: false,
                color: trackColors[i % trackColors.length],
                audioData: audioData,
                audioElement: audioElement,
                gainNode: gainNode,
                leftGain: leftGain,
                rightGain: rightGain,
                splitter: splitter,
                merger: merger,
                sourceNode: source,
                analyserNode: analyserNode,
                vuLevel: 0,
                vuPeak: 0,
                vuClip: false,
                originalFile: file
            };

            // ✅ Valores iniciais (centro)
            gainNode.gain.value = newTrack.volume / 100;
            leftGain.gain.value = 1;
            rightGain.gain.value = 1;

            // Time update listener with improved sync
            audioElement.addEventListener('timeupdate', () => {
                if (state.isPlaying) {
                    state.currentTime = audioElement.currentTime;
                }
            });

            audioElement.addEventListener('ended', () => {
                if (state.isPlaying) {
                    const allEnded = state.tracks.every(t => 
                        !t.audioElement || t.audioElement.ended || t.audioElement.paused
                    );
                    if (allEnded) {
                        state.isPlaying = false;
                        stopBPMPulse();
                        render();
                    }
                }
            });

            newTracks.push(newTrack);
        } catch (error) {
            console.error('Error loading audio:', file.name, error);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    state.tracks = [...state.tracks, ...newTracks];
    state.duration = maxDuration || 180;
    state.isImporting = false;
    hideLoadingOverlay();
    
    // Save initial state to history
    saveToHistory();
    render();
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function createAudioElement(file) {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        const url = URL.createObjectURL(file);
        audio.addEventListener('loadedmetadata', () => resolve(audio));
        audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
        audio.src = url;
        audio.preload = 'metadata';
    });
}

function base64ToAudioElement(base64) {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.addEventListener('loadedmetadata', () => resolve(audio));
        audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
        audio.src = base64;
        audio.preload = 'metadata';
    });
}
// ========================================
// MULTITRACK PRO - PARTE 3/5
// VU Meters, Markers e Track Controls
// ========================================

// ========================================
// VU METERS
// ========================================

function startVUMeters() {
    if (vuMeterInterval) clearInterval(vuMeterInterval);
    
    vuMeterInterval = setInterval(() => {
        state.tracks.forEach(track => {
            if (!track.analyserNode) return;
            
            const dataArray = new Uint8Array(track.analyserNode.frequencyBinCount);
            track.analyserNode.getByteFrequencyData(dataArray);
            
            // Calculate RMS level
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / dataArray.length);
            const level = (rms / 255) * 100;
            
            track.vuLevel = level;
            
            // Peak hold
            if (level > track.vuPeak) {
                track.vuPeak = level;
            } else {
                track.vuPeak = Math.max(0, track.vuPeak - 2); // Decay
            }
            
            // Clip detection (above 95%)
            if (level > 95) {
                track.vuClip = true;
                setTimeout(() => { track.vuClip = false; }, 1000);
            }
            
            updateVUMeter(track);
        });
    }, 50);
}

function updateVUMeter(track) {
    const vuBar = document.querySelector(`[data-vu-track="${track.id}"] .vu-meter-bar`);
    const vuPeak = document.querySelector(`[data-vu-track="${track.id}"] .vu-meter-peak`);
    const vuClip = document.querySelector(`[data-vu-track="${track.id}"] .vu-meter-clip`);
    
    if (vuBar) vuBar.style.height = `${track.vuLevel}%`;
    if (vuPeak) vuPeak.style.top = `${100 - track.vuPeak}%`;
    if (vuClip) vuClip.classList.toggle('active', track.vuClip);
}

// ========================================
// MARKERS
// ========================================

async function addMarker() {
    const name = await showPrompt('Nome do marker:', 'Seção ' + (state.markers.length + 1));
    if (!name) return;

    const shortcutKey = await showPrompt('Tecla de atalho (1-9):', String(Math.min(state.markers.length + 1, 9)));
    const keyNum = parseInt(shortcutKey);
    
    const newMarker = {
        id: Date.now(),
        time: state.currentTime,
        name: name
    };

    if (keyNum >= 1 && keyNum <= 9) {
        state.markerShortcuts[newMarker.id] = keyNum;
    }

    state.markers.push(newMarker);
    state.markers.sort((a, b) => a.time - b.time);
    
    saveToHistory();
    render();
}

function deleteMarker(markerId, event) {
    event.stopPropagation();
    state.markers = state.markers.filter(m => m.id !== markerId);
    delete state.markerShortcuts[markerId];
    saveToHistory();
    render();
}

function seekToMarker(time) {
    seekToMarkerWithPreRoll(time);
}

// ========================================
// TRACK CONTROLS - PAN MELHORADO
// ========================================

// ========================================
// VOLUME FLUIDO COM RAF
// ========================================
function handleVolumeChange(trackId, value) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.volume = parseInt(value);
    
    // ✅ Aplica no gainNode SEM fade
    track.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    track.gainNode.gain.setValueAtTime(track.volume / 100, audioContext.currentTime);
    
    // ✅ Update visual com RAF (throttling automático)
    if (!track.volumeUpdateScheduled) {
        track.volumeUpdateScheduled = true;
        requestAnimationFrame(() => {
            updateVolumeVisual(trackId, track.volume);
            track.volumeUpdateScheduled = false;
        });
    }
    
    // ✅ Debounce para salvar histórico
    clearTimeout(track.volumeDebounceTimer);
    track.volumeDebounceTimer = setTimeout(() => {
        saveToHistory();
        markProjectAsModified();
    }, 500);
}

// ========================================
// UPDATE VISUAL DO VOLUME (SEM RENDER)
// ========================================
function updateVolumeVisual(trackId, volume) {
    const channel = document.querySelector(`.track-channel[data-track-id="${trackId}"]`);
    if (!channel) return;
    
    // Atualiza barra
    const faderLevel = channel.querySelector('.fader-level');
    if (faderLevel) {
        faderLevel.style.height = `${volume}%`;
    }
    
    // Atualiza handle
    const faderHandle = channel.querySelector('.fader-handle');
    if (faderHandle) {
        faderHandle.style.bottom = `calc(${volume}% - 24px)`;
    }
    
    // Atualiza texto
    const valueDisplay = channel.querySelector('.volume-value');
    if (valueDisplay) {
        valueDisplay.textContent = volume;
    }
}

// ========================================
// PAN PROFISSIONAL - CONSTANT POWER
// ========================================
// ========================================
// PAN INSTANTÂNEO - CONTROLE MANUAL
// ========================================
function handlePanChange(trackId, value) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track || !track.leftGain || !track.rightGain) return;
    
    const newPan = parseFloat(value);
    track.pan = Math.max(-1, Math.min(1, newPan));
    
    // ✅ LINEAR PAN (som vai 100% pra um lado)
    // pan = -1: left=1, right=0
    // pan =  0: left=1, right=1
    // pan = +1: left=0, right=1
    
    const leftGainValue = Math.max(0, 1 - track.pan);
    const rightGainValue = Math.max(0, 1 + track.pan);
    
    // ✅ APLICA DIRETO (sem cancelScheduledValues, sem setValueAtTime)
    track.leftGain.gain.value = leftGainValue;
    track.rightGain.gain.value = rightGainValue;
    
    console.log(`🎚️ Pan: ${formatPan(track.pan)} | L:${(leftGainValue*100).toFixed(0)}% R:${(rightGainValue*100).toFixed(0)}%`);
    
    updatePanVisual(trackId, track.pan);
    
    clearTimeout(track.panDebounceTimer);
    track.panDebounceTimer = setTimeout(() => {
        saveToHistory();
        markProjectAsModified();
    }, 500);
}
// ========================================
// UPDATE VISUAL DO PAN (SEM RENDER FULL)
// ========================================
function updatePanVisual(trackId, panValue) {
    const container = document.querySelector(`.pan-knob-container[data-track-id="${trackId}"]`);
    if (!container) return;
    
    // Atualiza rotação do indicador
    const indicator = container.querySelector('.pan-knob-indicator');
    if (indicator) {
        indicator.style.transform = `translateX(-50%) rotate(${panValue * 135}deg)`;
    }
    
    // Atualiza cor do centro (verde quando no centro)
    const isCenter = Math.abs(panValue) < 0.05;
    if (isCenter) {
        container.setAttribute('data-pan-center', 'true');
    } else {
        container.removeAttribute('data-pan-center');
    }
    
    // Atualiza texto
    const valueDisplay = container.closest('.track-channel').querySelector('.pan-value');
    if (valueDisplay) {
        valueDisplay.textContent = formatPan(panValue);
    }
}
// ========================================
// MASTER VOLUME FLUIDO
// ========================================
function handleMasterVolumeChange(value) {
    state.masterVolume = parseInt(value);
    
    // ✅ Aplica SEM fade
    const targetValue = state.masterMute ? 0 : state.masterVolume / 100;
    masterGainNode.gain.cancelScheduledValues(audioContext.currentTime);
    masterGainNode.gain.setValueAtTime(targetValue, audioContext.currentTime);
    
    // ✅ Update visual com RAF
    if (!state.masterVolumeUpdateScheduled) {
        state.masterVolumeUpdateScheduled = true;
        requestAnimationFrame(() => {
            updateMasterVolumeVisual(state.masterVolume);
            state.masterVolumeUpdateScheduled = false;
        });
    }
    
    // ✅ Debounce para salvar histórico
    clearTimeout(state.masterVolumeDebounceTimer);
    state.masterVolumeDebounceTimer = setTimeout(() => {
        saveToHistory();
        markProjectAsModified();
    }, 500);
}

// ========================================
// UPDATE VISUAL DO MASTER (SEM RENDER)
// ========================================
function updateMasterVolumeVisual(volume) {
    const masterTrack = document.querySelector('.master-track');
    if (!masterTrack) return;
    
    // Atualiza barra
    const faderLevel = masterTrack.querySelector('.fader-level');
    if (faderLevel) {
        faderLevel.style.height = `${volume}%`;
    }
    
    // Atualiza handle
    const faderHandle = masterTrack.querySelector('.fader-handle');
    if (faderHandle) {
        faderHandle.style.bottom = `calc(${volume}% - 28px)`;
    }
    
    // Atualiza texto
    const valueDisplay = masterTrack.querySelector('.volume-value');
    if (valueDisplay) {
        valueDisplay.textContent = volume;
    }
}

// ========================================
// TOGGLE SOLO - COM PAN MANUAL
// ========================================
function toggleSolo(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    track.solo = !track.solo;
    const hasSolo = state.tracks.some(t => t.solo);
    
    state.tracks.forEach(t => {
        if (hasSolo) {
            if (t.solo) {
                t.gainNode.gain.setValueAtTime(t.volume / 100, audioContext.currentTime);
                if (t.audioElement && state.isPlaying) t.audioElement.play().catch(() => {});
            } else {
                t.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                if (t.audioElement) t.audioElement.pause();
            }
        } else {
            const gainValue = t.mute ? 0 : t.volume / 100;
            t.gainNode.gain.setValueAtTime(gainValue, audioContext.currentTime);
            if (t.audioElement && state.isPlaying && !t.mute) t.audioElement.play().catch(() => {});
        }
    });
    
    saveToHistory();
    markProjectAsModified();
    render();
}
// ========================================
// TOGGLE MUTE - COM PAN MANUAL
// ========================================
function toggleMute(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    track.mute = !track.mute;
    const hasSolo = state.tracks.some(t => t.solo);
    
    if (!hasSolo) {
        const gainValue = track.mute ? 0 : track.volume / 100;
        track.gainNode.gain.setValueAtTime(gainValue, audioContext.currentTime);
        if (track.audioElement) {
            if (track.mute) {
                track.audioElement.pause();
            } else if (state.isPlaying) {
                track.audioElement.currentTime = state.currentTime;
                track.audioElement.play().catch(() => {});
            }
        }
    }
    
    saveToHistory();
    markProjectAsModified();
    render();
}
// ========================================
// LOADING OVERLAY
// ========================================

function showLoadingOverlay() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoadingOverlay() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function updateLoadingProgress(current, total, fileName) {
    document.getElementById('progress-current').textContent = current;
    document.getElementById('progress-total').textContent = total;
    document.getElementById('progress-fill').style.width = `${(current / total) * 100}%`;
    document.getElementById('loading-filename').textContent = fileName;
}

// ========================================
// WAVEFORM VISUALIZATION
// ========================================

// Cache do waveform para performance
let waveformCache = null;
let lastCanvasWidth = 0;

function drawWaveform() {
    const canvas = document.getElementById('waveform');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth * 2;
    const height = canvas.height = 120;

    // Se tamanho mudou ou não tem cache, redesenha tudo
    if (!waveformCache || lastCanvasWidth !== width) {
        ctx.clearRect(0, 0, width, height);

        const barWidth = 3;
        const gap = 2;
        const numBars = Math.floor(width / (barWidth + gap));

        // Gera barras apenas uma vez
        if (!waveformCache || lastCanvasWidth !== width) {
            waveformCache = [];
            for (let i = 0; i < numBars; i++) {
                waveformCache.push(Math.random() * height * 0.8 + height * 0.1);
            }
            lastCanvasWidth = width;
        }

        const centerY = height / 2;
        const progress = state.currentTime / state.duration;

        for (let i = 0; i < numBars; i++) {
            const x = i * (barWidth + gap);
            const barHeight = waveformCache[i];
            const isPlayed = i < numBars * progress;

            ctx.fillStyle = isPlayed ? '#3b82f6' : '#374151';
            ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        }
    } else {
        // Apenas redesenha com novo progresso
        ctx.clearRect(0, 0, width, height);
        
        const barWidth = 3;
        const gap = 2;
        const centerY = height / 2;
        const progress = state.currentTime / state.duration;
        const numBars = waveformCache.length;

        for (let i = 0; i < numBars; i++) {
            const x = i * (barWidth + gap);
            const barHeight = waveformCache[i];
            const isPlayed = i < numBars * progress;

            ctx.fillStyle = isPlayed ? '#3b82f6' : '#374151';
            ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        }
    }

    // Playhead
    const playheadX = (state.currentTime / state.duration) * width;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(playheadX - 1, 0, 2, height);
}

function startWaveformAnimation() {
    // Desenha waveform estático apenas uma vez
    drawWaveform();
    
    // Atualiza apenas o tempo e playhead
    setInterval(() => {
        updateTimeDisplay();
        updatePlayhead(); // Nova função
    }, 100);
}

// NOVA FUNÇÃO - Adicione logo depois
function updatePlayhead() {
    const canvas = document.getElementById('waveform');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Redesenha apenas se estiver tocando
    if (state.isPlaying) {
        drawWaveform(); // Redesenha tudo quando tocando
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimeDisplay() {
    const timeDisplay = document.querySelector('.time-display');
    if (timeDisplay) {
        timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
    }
}

function formatPan(value) {
    if (Math.abs(value) < 0.05) return 'C'; // Centro com tolerância
    if (value < 0) return `L${Math.abs(Math.round(value * 100))}`;
    return `R${Math.round(value * 100)}`;
}
// ========================================
// MULTITRACK PRO - PARTE 4/5
// Save, Load, Export Projects
// ========================================

// ========================================
// PROJECT MANAGEMENT
// ========================================




async function copyAudioFilesToProjectFolder(projectFolderHandle, tracks) {
    const copiedFiles = [];

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        updateLoadingProgress(i + 1, tracks.length, `Copiando ${track.name}...`);

        try {
            // Pega o arquivo original da memória
            if (!track.originalFile) {
                console.warn(`Track ${track.name} não tem arquivo original`);
                continue;
            }

            // Cria nome de arquivo único
            const filename = `track_${track.id}_${track.originalFile.name}`;

            // Cria/sobrescreve arquivo na pasta do projeto
            const fileHandle = await projectFolderHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(track.originalFile);
            await writable.close();

            copiedFiles.push({
                trackId: track.id,
                filename: filename
            });

            console.log(`✅ Copiado: ${filename}`);

        } catch (err) {
            console.error(`❌ Erro ao copiar ${track.name}:`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return copiedFiles;
}
// ========================================
// PASSO 8: SUBSTITUA COMPLETAMENTE saveCurrentProject()
// Local: Linha ~890
// ========================================

async function saveCurrentProject() {
    if (state.tracks.length === 0) {
        showAlert('Adicione tracks antes de salvar o projeto');
        return;
    }

    let projectName;
    
    // Mobile/Tablet: sempre pede nome
    if (!supportsFileSystem) {
        projectName = await showPrompt(
            'Nome do projeto:', 
            state.currentProject?.name || `Projeto ${Date.now()}`
        );
        
        if (!projectName) return;
        
        // Atualiza nome antes de salvar
        if (state.currentProject) {
            state.currentProject.name = projectName;
        }
    } else {
        // Desktop: usa nome existente ou pede novo
        if (state.currentProject) {
            projectName = state.currentProject.name;
        } else {
            projectName = await showPrompt(
                'Nome do projeto:', 
                `Projeto ${state.savedProjects.length + 1}`
            );
            
            if (!projectName) return;
        }
    }

    await saveCurrentProjectWithName(projectName);
}


async function saveCurrentProjectWithName(projectName) {
    console.log('🔍 Salvando projeto:', projectName);
    console.log('   - Modo:', state.storageMode);
    
    showEnhancedLoading([
        '📝 Preparando dados...',
        '💾 Salvando arquivos...',
        '✅ Finalizando...'
    ]);
    
    // ========== MODO GOOGLE DRIVE ==========
    if (state.storageMode === 'drive' && state.googleDriveConnected) {
        try {
            updateLoadingStep(0, 'complete');
            
            // Prepara dados com áudios em base64
            const tracksWithAudio = await Promise.all(state.tracks.map(async (t) => {
                let audioData = t.audioData;
                if (!audioData && t.originalFile) {
                    audioData = await fileToBase64(t.originalFile);
                }
                return {
                    id: t.id,
                    name: t.name,
                    volume: t.volume,
                    pan: t.pan,
                    solo: t.solo,
                    mute: t.mute,
                    color: t.color,
                    audioData: audioData
                };
            }));
            
            const projectData = {
                id: state.currentProject?.id || Date.now(),
                name: projectName,
                tracks: tracksWithAudio,
                markers: [...state.markers],
                markerShortcuts: {...state.markerShortcuts},
                duration: state.duration,
                masterVolume: state.masterVolume,
                masterMute: state.masterMute,
                bpm: state.bpm,
                key: state.key,
                fadeInTime: state.fadeInTime,
                fadeOutTime: state.fadeOutTime,
                createdAt: state.currentProject?.createdAt || new Date().toLocaleString('pt-BR'),
                updatedAt: new Date().toLocaleString('pt-BR'),
                driveFileId: state.currentProject?.driveFileId
            };
            
            updateLoadingStep(1, 'active');
            const savedProject = await saveProjectToDrive(projectData);
            updateLoadingStep(1, 'complete');
            
            // Atualiza lista local
            if (state.currentProject) {
                const index = state.savedProjects.findIndex(p => p.id === state.currentProject.id);
                if (index !== -1) {
                    state.savedProjects[index] = savedProject;
                } else {
                    state.savedProjects.push(savedProject);
                }
            } else {
                state.savedProjects.push(savedProject);
            }
            
            state.currentProject = savedProject;
            markProjectAsSaved();
            
            updateLoadingStep(2, 'complete');
            hideEnhancedLoading();
            
            successToast(`Projeto salvo! Sincronizado às ${state.lastSyncTime}`, {
                title: '☁️ Google Drive'
            });
            
            render();
            return;
            
        } catch (err) {
            console.error('❌ Erro ao salvar no Drive:', err);
            hideEnhancedLoading();
            
            const shouldFallback = await showConfirm(
                '❌ Erro ao salvar no Google Drive.\n\n' +
                'Deseja exportar como arquivo .mtp local?'
            );
            
            if (shouldFallback) {
                exportProjectAsFileFallback();
            }
            return;
        }
    }
    
    // ========== MODO PASTA LOCAL ==========
    if (supportsFileSystem && libraryFolderHandle) {
        try {
            updateLoadingStep(0, 'complete');
            
            // Verifica se ainda tem acesso à pasta
            const hasPermission = await verifyPermission(libraryFolderHandle);
            if (!hasPermission) {
                hideEnhancedLoading();
                errorToast('Sem permissão para acessar a pasta. Selecione novamente nas Settings.', {
                    title: 'Acesso Negado'
                });
                return;
            }
            
            // Cria nome único para pasta do projeto
            const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = Date.now();
            const folderName = `${safeName}_${timestamp}`;
            
            let projectFolder;
            
            // Se é atualização de projeto existente
            if (state.currentProject?.folderName) {
                try {
                    projectFolder = await libraryFolderHandle.getDirectoryHandle(
                        state.currentProject.folderName
                    );
                    console.log('✅ Atualizando projeto existente');
                } catch {
                    // Pasta não existe, cria nova
                    projectFolder = await libraryFolderHandle.getDirectoryHandle(
                        folderName, 
                        { create: true }
                    );
                    console.log('✅ Criando nova pasta:', folderName);
                }
            } else {
                // Novo projeto - cria pasta
                projectFolder = await libraryFolderHandle.getDirectoryHandle(
                    folderName, 
                    { create: true }
                );
                console.log('✅ Criando novo projeto:', folderName);
            }
            
            updateLoadingStep(1, 'active');
            
            // Copia arquivos de áudio
            const copiedFiles = await copyAudioFilesToProjectFolder(projectFolder, state.tracks);
            
            updateLoadingStep(1, 'complete');
            updateLoadingStep(2, 'active');
            
            // Prepara dados do projeto (SEM audioData)
            const tracksData = state.tracks.map((t, index) => {
                const copiedFile = copiedFiles.find(cf => cf.trackId === t.id);
                return {
                    id: t.id,
                    name: t.name,
                    volume: t.volume,
                    pan: t.pan,
                    solo: t.solo,
                    mute: t.mute,
                    color: t.color,
                    filename: copiedFile ? copiedFile.filename : null
                };
            });
            
            const projectData = {
                id: state.currentProject?.id || Date.now(),
                name: projectName,
                tracks: tracksData,
                markers: [...state.markers],
                markerShortcuts: {...state.markerShortcuts},
                duration: state.duration,
                masterVolume: state.masterVolume,
                masterMute: state.masterMute,
                bpm: state.bpm,
                key: state.key,
                fadeInTime: state.fadeInTime,
                fadeOutTime: state.fadeOutTime,
                createdAt: state.currentProject?.createdAt || new Date().toLocaleString('pt-BR'),
                updatedAt: new Date().toLocaleString('pt-BR'),
                folderName: state.currentProject?.folderName || folderName,
                source: 'library'
            };
            
            // Salva projeto.json
            const jsonHandle = await projectFolder.getFileHandle('projeto.json', { create: true });
            const writable = await jsonHandle.createWritable();
            await writable.write(JSON.stringify(projectData, null, 2));
            await writable.close();
            
            // Atualiza state
            if (state.currentProject) {
                const index = state.savedProjects.findIndex(p => p.id === state.currentProject.id);
                if (index !== -1) {
                    state.savedProjects[index] = projectData;
                } else {
                    state.savedProjects.push(projectData);
                }
            } else {
                state.savedProjects.push(projectData);
            }
            
            state.currentProject = projectData;
            markProjectAsSaved();
            
            updateLoadingStep(2, 'complete');
            hideEnhancedLoading();
            
            successToast(`Projeto salvo! Pasta: ${state.libraryPath}`, {
                title: '📁 Biblioteca Local'
            });
            
            render();
            console.log('✅ Projeto salvo com sucesso');
            return;
            
        } catch (err) {
            console.error('❌ Erro ao salvar na pasta local:', err);
            hideEnhancedLoading();
            
            const shouldFallback = await showConfirm(
                '❌ Erro ao salvar na pasta local.\n\n' +
                'Deseja exportar como arquivo .mtp?'
            );
            
            if (shouldFallback) {
                exportProjectAsFileFallback();
            }
            return;
        }
    }
}

async function ensureLibraryAccess() {
    // Se já tem handle, retorna true
    if (libraryFolderHandle) {
        return true;
    }
    
    // Se tem path salvo mas perdeu handle, tenta recuperar
    if (state.libraryPath) {
        const shouldReselect = await showConfirm(
            `📁 Biblioteca configurada: ${state.libraryPath}\n\nMas precisamos de permissão novamente.\n\nAbrir seletor de pasta?`
        );
        
        if (shouldReselect) {
            return await setupLibraryFolder();
        }
    }
    
    return false;
}
// ========================================
// SALVAR COMO (NOVA CÓPIA)
// ========================================

async function saveProjectAs() {
    if (state.tracks.length === 0) {
        showAlert('Adicione tracks antes de salvar o projeto');
        return;
    }

    const projectName = await showPrompt(
        'Nome do novo projeto:', 
        `${state.currentProject?.name || 'Projeto'} - Cópia`
    );
    if (!projectName) return;

    // Temporariamente remove referência ao projeto atual
    const tempProject = state.currentProject;
    state.currentProject = null;
    // TESTE - ADICIONE ANTES DE saveCurrentProjectWithName()
window.testLibrary = function() {
    console.log('📊 Estado da Biblioteca:');
    console.log('   - supportsFileSystem:', supportsFileSystem);
    console.log('   - libraryFolderHandle:', libraryFolderHandle);
    console.log('   - state.libraryPath:', state.libraryPath);
    console.log('   - state.tracks.length:', state.tracks.length);
    
    if (state.tracks.length > 0) {
        console.log('   - track[0].originalFile:', state.tracks[0].originalFile);
    }
};
    // Salva como novo
    await saveCurrentProjectWithName(projectName);
    
    // Não restaura o antigo (agora estamos no novo)
}

// NOVA FUNÇÃO - Exporta projeto como fallback (mobile)
async function exportProjectAsFileFallback() {
    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Exportando projeto completo...');

    // ✅ AGORA SALVA OS ÁUDIOS EM BASE64
    const tracksData = await Promise.all(state.tracks.map(async (t) => {
        let audioData = t.audioData; // Se já tem base64
        
        // Se não tem base64, converte do arquivo
        if (!audioData && t.originalFile) {
            audioData = await fileToBase64(t.originalFile);
        }
        
        return {
            id: t.id,
            name: t.name,
            volume: t.volume,
            pan: t.pan,
            solo: t.solo,
            mute: t.mute,
            color: t.color,
            audioData: audioData  // ✅ INCLUI OS ÁUDIOS
        };
    }));

    const projectData = {
        id: state.currentProject?.id || Date.now(),
        name: state.currentProject?.name || 'Projeto',
        tracks: tracksData,
        markers: [...state.markers],
        markerShortcuts: {...state.markerShortcuts},
        duration: state.duration,
        masterVolume: state.masterVolume,
        masterMute: state.masterMute,
        bpm: state.bpm,
        key: state.key,
        fadeInTime: state.fadeInTime,
        fadeOutTime: state.fadeOutTime,
        createdAt: state.currentProject?.createdAt || new Date().toLocaleString('pt-BR'),
        updatedAt: new Date().toLocaleString('pt-BR'),
        source: 'mobile'
    };

    try {
        const jsonString = JSON.stringify(projectData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectData.name}.mtp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Adiciona à biblioteca local
        state.savedProjects.push(projectData);
        state.currentProject = projectData;
        markProjectAsSaved();

        hideLoadingOverlay();
        showAlert('✅ Projeto completo exportado!\n\n📱 Arquivo salvo nos Downloads.\n\nProjeto adicionado à biblioteca local.');
        render();
        
    } catch (err) {
        hideLoadingOverlay();
        console.error('❌ Erro ao exportar:', err);
        showAlert(`❌ Erro: ${err.message}`);
    }
}
// ========================================
// PASSO 9: SUBSTITUA COMPLETAMENTE loadProject()
// Local: Linha ~1050
// ========================================

// ========================================
// FUNÇÃO COMPLETA loadProject() - VERSÃO ULTRA OTIMIZADA
// Substitua a função inteira pelo código abaixo
// ========================================

// ========================================
// loadProject() - COM CACHE E PRELOAD
// ========================================

// ========================================
// loadProject() - COM PAN MANUAL INSTANTÂNEO
// ========================================

// ========================================
// loadProject() - VERSÃO 100% CORRIGIDA
// Substitua a função inteira (busque por "async function loadProject")
// ========================================

async function loadProject(project) {
    console.log('🔍 ========== loadProject() INICIADO ==========');
    console.log('   - ID:', project.id);
    console.log('   - Nome:', project.name);
    console.log('   - Source:', project.source);
    console.log('   - DriveFileId:', project.driveFileId);
    console.log('   - FolderName:', project.folderName);
    
    // ⚡ CACHE
    const cachedProject = projectCache.get(project.id);
    if (cachedProject?.cachedAudioFiles?.length > 0) {
        console.log('⚡ CACHE HIT!');
        return await loadProjectFromCache(cachedProject);
    }
    
    console.log('❌ Cache miss - Carregando...');
    
    showEnhancedLoading([
        '📥 Carregando metadados...',
        '🔊 Baixando áudios...',
        '🎵 Criando tracks...',
        '✅ Finalizando...'
    ]);

    try {
        let projectData = project;

        // ========================================
        // BIBLIOTECA LOCAL - ✅ CORRIGIDO
        // ========================================
        if (project.source === 'library' && project.folderName && libraryFolderHandle) {
            console.log('📁 ========== MODO BIBLIOTECA LOCAL ==========');
            updateLoadingStep(0, 'active');
            
            // ✅ CORREÇÃO: Define projectFolder aqui!
            let projectFolder;
            
            try {
                projectFolder = await libraryFolderHandle.getDirectoryHandle(project.folderName);
                const fileHandle = await projectFolder.getFileHandle('projeto.json');
                const file = await fileHandle.getFile();
                const text = await file.text();
                projectData = JSON.parse(text);
                projectData.folderName = project.folderName;
                projectData.source = 'library';
                
                console.log('   ✅ projeto.json carregado');
                console.log('   - Tracks:', projectData.tracks.length);
            } catch (err) {
                console.error('   ❌ Erro ao ler projeto.json:', err);
                hideEnhancedLoading();
                errorToast('Não foi possível ler o projeto da pasta local');
                return;
            }

            state.currentProject = projectData;
            state.markers = [...projectData.markers];
            state.markerShortcuts = {...(projectData.markerShortcuts || {})};
            state.duration = projectData.duration;
            state.masterVolume = projectData.masterVolume;
            state.masterMute = projectData.masterMute || false;
            state.bpm = projectData.bpm || 120;
            state.key = projectData.key || 'C';
            state.fadeInTime = projectData.fadeInTime || 0.5;
            state.fadeOutTime = projectData.fadeOutTime || 1.5;

            updateMasterGain();
            updateLoadingStep(0, 'complete');
            updateLoadingStep(1, 'active');

            const newTracks = [];

            for (let i = 0; i < projectData.tracks.length; i++) {
                const trackData = projectData.tracks[i];
                console.log(`   🔨 [${i+1}/${projectData.tracks.length}] ${trackData.name}...`);

                try {
                    if (!trackData.filename) {
                        console.warn('      ⚠️ Track sem filename');
                        continue;
                    }

                    // ✅ USA projectFolder que foi definido acima
                    const audioFileHandle = await projectFolder.getFileHandle(trackData.filename);
                    const audioFile = await audioFileHandle.getFile();
                    const audioElement = await createAudioElement(audioFile);
                    
                    const source = audioContext.createMediaElementSource(audioElement);
                    const gainNode = audioContext.createGain();
                    const splitter = audioContext.createChannelSplitter(2);
                    const merger = audioContext.createChannelMerger(2);
                    const leftGain = audioContext.createGain();
                    const rightGain = audioContext.createGain();
                    const analyserNode = audioContext.createAnalyser();

                    analyserNode.fftSize = 256;
                    analyserNode.smoothingTimeConstant = 0.8;

                    source.connect(splitter);
                    splitter.connect(leftGain, 0);
                    splitter.connect(rightGain, 1);
                    leftGain.connect(merger, 0, 0);
                    rightGain.connect(merger, 0, 1);
                    merger.connect(gainNode);
                    gainNode.connect(analyserNode);
                    analyserNode.connect(masterGainNode);

                    const track = {
                        id: trackData.id,
                        name: trackData.name,
                        volume: trackData.volume,
                        pan: trackData.pan,
                        solo: trackData.solo,
                        mute: trackData.mute,
                        color: trackData.color,
                        originalFile: audioFile,
                        audioElement: audioElement,
                        gainNode: gainNode,
                        leftGain: leftGain,
                        rightGain: rightGain,
                        splitter: splitter,
                        merger: merger,
                        sourceNode: source,
                        analyserNode: analyserNode,
                        vuLevel: 0,
                        vuPeak: 0,
                        vuClip: false
                    };

                    gainNode.gain.value = track.volume / 100;
                    
                    const leftGainValue = Math.max(0, 1 - track.pan);
                    const rightGainValue = Math.max(0, 1 + track.pan);
                    leftGain.gain.value = leftGainValue;
                    rightGain.gain.value = rightGainValue;

                    audioElement.addEventListener('timeupdate', () => {
                        if (state.isPlaying) state.currentTime = audioElement.currentTime;
                    });

                    audioElement.addEventListener('ended', () => {
                        if (state.isPlaying) {
                            const allEnded = state.tracks.every(t =>
                                !t.audioElement || t.audioElement.ended || t.audioElement.paused
                            );
                            if (allEnded) {
                                state.isPlaying = false;
                                stopBPMPulse();
                                render();
                            }
                        }
                    });

                    newTracks.push(track);
                    console.log(`      ✅ Track ${trackData.name} criada`);

                } catch (error) {
                    console.error(`      ❌ Erro ao criar track ${trackData.name}:`, error);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            updateLoadingStep(1, 'complete');
            updateLoadingStep(2, 'active');

            state.tracks = newTracks;
            state.currentTime = 0;
            state.isPlaying = false;
            state.activeTab = 'mixer';

            history = [];
            historyIndex = -1;
            saveToHistory();

            updateLoadingStep(2, 'complete');
            updateLoadingStep(3, 'complete');
            hideEnhancedLoading();
            
            successToast(`${newTracks.length} tracks carregadas!`, {
                title: '📁 ' + projectData.name
            });
            
            markProjectAsSaved();
            render();
            console.log('✅ ========== BIBLIOTECA LOCAL OK ==========');
            return;
        }

        // ========================================
        // GOOGLE DRIVE - ✅ CORRIGIDO
        // ========================================
        if (project.source === 'drive' && project.driveFileId && state.googleDriveConnected) {
            console.log('☁️ ========== MODO GOOGLE DRIVE ==========');
            
            try {
                updateLoadingStep(0, 'active');
                
                const projectFolderId = project.driveFileId;
                console.log('   📁 Pasta do projeto:', projectFolderId);
                
                const jsonSearch = await gapi.client.drive.files.list({
                    q: `name='projeto.json' and '${projectFolderId}' in parents and trashed=false`,
                    fields: 'files(id)'
                });
                
                if (jsonSearch.result.files.length === 0) {
                    throw new Error('projeto.json não encontrado');
                }
                
                console.log('   ✅ projeto.json encontrado');
                
                const jsonContent = await gapi.client.drive.files.get({
                    fileId: jsonSearch.result.files[0].id,
                    alt: 'media'
                });
                
                projectData = JSON.parse(jsonContent.body);
                projectData.source = 'drive';
                projectData.driveFileId = projectFolderId;
                
                console.log('   ✅ Metadados carregados');
                console.log('   - Tracks:', projectData.tracks.length);
                
                state.currentProject = projectData;
                state.markers = [...projectData.markers];
                state.markerShortcuts = {...(projectData.markerShortcuts || {})};
                state.duration = projectData.duration;
                state.masterVolume = projectData.masterVolume;
                state.masterMute = projectData.masterMute || false;
                state.bpm = projectData.bpm || 120;
                state.key = projectData.key || 'C';
                state.fadeInTime = projectData.fadeInTime || 0.5;
                state.fadeOutTime = projectData.fadeOutTime || 1.5;
                
                updateMasterGain();
                updateLoadingStep(0, 'complete');
                updateLoadingStep(1, 'active');
                
                console.log('   ⚡ Baixando áudios...');
                
                // ✅ CORREÇÃO: USA GAPI AO INVÉS DE FETCH (mais confiável)
                const downloadPromises = projectData.tracks.map(async (trackData, index) => {
                    if (!trackData.driveFileId) {
                        console.warn(`   ⚠️ Track ${trackData.name} sem driveFileId`);
                        return null;
                    }
                    
                    try {
                        console.log(`      📥 [${index+1}/${projectData.tracks.length}] ${trackData.name}...`);
                        
                        // ✅ USA GAPI (não fetch!)
                        const audioResponse = await gapi.client.drive.files.get({
                            fileId: trackData.driveFileId,
                            alt: 'media'
                        });
                        
                        // Converte resposta GAPI para Blob
                        const binaryString = audioResponse.body;
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
                        const audioFile = new File(
                            [audioBlob], 
                            trackData.filename || 'track.mp3', 
                            { type: 'audio/mpeg' }
                        );
                        
                        console.log(`      ✅ ${trackData.name} (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`);
                        
                        return { trackData, audioFile };
                        
                    } catch (err) {
                        console.error(`      ❌ Erro: ${trackData.name}`, err.message);
                        return null;
                    }
                });
                
                const downloadedTracks = await Promise.all(downloadPromises);
                const validTracks = downloadedTracks.filter(t => t !== null);
                
                console.log(`   ✅ ${validTracks.length}/${projectData.tracks.length} áudios baixados`);
                
                if (validTracks.length === 0) {
                    throw new Error('Nenhum áudio foi baixado');
                }
                
                projectData.cachedAudioFiles = validTracks;
                await projectCache.set(project.id, projectData);
                
                updateLoadingStep(1, 'complete');
                updateLoadingStep(2, 'active');
                
                const newTracks = await createAudioTracksFromFiles(validTracks);
                
                if (newTracks.length === 0) {
                    throw new Error('Falha ao criar tracks');
                }
                
                state.tracks = newTracks;
                state.currentTime = 0;
                state.isPlaying = false;
                state.activeTab = 'mixer';
                
                history = [];
                historyIndex = -1;
                saveToHistory();
                
                updateLoadingStep(2, 'complete');
                updateLoadingStep(3, 'complete');
                hideEnhancedLoading();
                
                markProjectAsSaved();
                
                successToast(`${newTracks.length} tracks prontas!`, {
                    title: '☁️ ' + projectData.name
                });
                
                render();
                suggestPreloadProjects(project.id);
                
                console.log('✅ ========== GOOGLE DRIVE OK ==========');
                return;
                
            } catch (err) {
                console.error('❌ ========== ERRO GOOGLE DRIVE ==========');
                console.error('   - Erro:', err.message);
                hideEnhancedLoading();
                errorToast('Erro ao carregar: ' + err.message);
                return;
            }
        }

        // ========================================
        // .MTP IMPORTADO
        // ========================================
        if (projectData.tracks && projectData.tracks[0]?.audioData) {
            console.log('📦 ========== MODO .MTP ==========');
            
            updateLoadingStep(0, 'active');
            
            state.currentProject = projectData;
            state.markers = [...projectData.markers];
            state.markerShortcuts = {...(projectData.markerShortcuts || {})};
            state.duration = projectData.duration;
            state.masterVolume = projectData.masterVolume;
            state.masterMute = projectData.masterMute || false;
            state.bpm = projectData.bpm || 120;
            state.key = projectData.key || 'C';
            state.fadeInTime = projectData.fadeInTime || 0.5;
            state.fadeOutTime = projectData.fadeOutTime || 1.5;

            updateMasterGain();
            updateLoadingStep(0, 'complete');
            updateLoadingStep(1, 'active');

            const newTracks = [];

            for (let i = 0; i < projectData.tracks.length; i++) {
                const trackData = projectData.tracks[i];
                console.log(`   🔨 [${i+1}/${projectData.tracks.length}] ${trackData.name}...`);

                try {
                    const audioElement = await base64ToAudioElement(trackData.audioData);
                    
                    const source = audioContext.createMediaElementSource(audioElement);
                    const gainNode = audioContext.createGain();
                    const splitter = audioContext.createChannelSplitter(2);
                    const merger = audioContext.createChannelMerger(2);
                    const leftGain = audioContext.createGain();
                    const rightGain = audioContext.createGain();
                    const analyserNode = audioContext.createAnalyser();

                    analyserNode.fftSize = 256;
                    analyserNode.smoothingTimeConstant = 0.8;

                    source.connect(splitter);
                    splitter.connect(leftGain, 0);
                    splitter.connect(rightGain, 1);
                    leftGain.connect(merger, 0, 0);
                    rightGain.connect(merger, 0, 1);
                    merger.connect(gainNode);
                    gainNode.connect(analyserNode);
                    analyserNode.connect(masterGainNode);

                    const track = {
                        id: trackData.id,
                        name: trackData.name,
                        volume: trackData.volume,
                        pan: trackData.pan,
                        solo: trackData.solo,
                        mute: trackData.mute,
                        color: trackData.color,
                        audioData: trackData.audioData,
                        audioElement: audioElement,
                        gainNode: gainNode,
                        leftGain: leftGain,
                        rightGain: rightGain,
                        splitter: splitter,
                        merger: merger,
                        sourceNode: source,
                        analyserNode: analyserNode,
                        vuLevel: 0,
                        vuPeak: 0,
                        vuClip: false
                    };

                    gainNode.gain.value = track.volume / 100;
                    
                    const leftGainValue = Math.max(0, 1 - track.pan);
                    const rightGainValue = Math.max(0, 1 + track.pan);
                    leftGain.gain.value = leftGainValue;
                    rightGain.gain.value = rightGainValue;

                    audioElement.addEventListener('timeupdate', () => {
                        if (state.isPlaying) state.currentTime = audioElement.currentTime;
                    });

                    audioElement.addEventListener('ended', () => {
                        if (state.isPlaying) {
                            const allEnded = state.tracks.every(t =>
                                !t.audioElement || t.audioElement.ended || t.audioElement.paused
                            );
                            if (allEnded) {
                                state.isPlaying = false;
                                stopBPMPulse();
                                render();
                            }
                        }
                    });

                    newTracks.push(track);
                    console.log(`      ✅ Track criada`);

                } catch (error) {
                    console.error(`      ❌ Erro: ${trackData.name}:`, error);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            updateLoadingStep(1, 'complete');
            updateLoadingStep(2, 'active');

            state.tracks = newTracks;
            state.currentTime = 0;
            state.isPlaying = false;
            state.activeTab = 'mixer';

            history = [];
            historyIndex = -1;
            saveToHistory();

            updateLoadingStep(2, 'complete');
            updateLoadingStep(3, 'complete');
            hideEnhancedLoading();
            
            successToast(`${newTracks.length} tracks importadas!`, {
                title: '📦 ' + projectData.name
            });
            
            markProjectAsSaved();
            render();
            console.log('✅ ========== .MTP OK ==========');
            return;
        }
        
        throw new Error('Formato não reconhecido');

    } catch (err) {
        console.error('❌ ========== ERRO FATAL ==========');
        console.error('   - Erro:', err.message);
        hideEnhancedLoading();
        errorToast('Erro: ' + err.message);
    }
}
// ========================================
// FUNÇÕES AUXILIARES DO CACHE
// ========================================

// ========================================
// CARREGAR DO CACHE - VERSÃO CORRIGIDA
// ========================================

// ========================================
// CARREGAR DO CACHE - COM PAN MANUAL
// ========================================


async function loadProjectFromCache(cachedProjectData) {
    console.log('⚡ ========== CARREGANDO DO CACHE ==========');
    console.log('   - Projeto:', cachedProjectData.name);
    console.log('   - Cached tracks:', cachedProjectData.cachedAudioFiles?.length);
    
    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Carregando do cache...');
    
    try {
        // Restaura configurações
        state.currentProject = cachedProjectData;
        state.markers = [...cachedProjectData.markers];
        state.markerShortcuts = {...(cachedProjectData.markerShortcuts || {})};
        state.duration = cachedProjectData.duration;
        state.masterVolume = cachedProjectData.masterVolume;
        state.masterMute = cachedProjectData.masterMute || false;
        state.bpm = cachedProjectData.bpm || 120;
        state.key = cachedProjectData.key || 'C';
        state.fadeInTime = cachedProjectData.fadeInTime || 0.5;
        state.fadeOutTime = cachedProjectData.fadeOutTime || 1.5;
        
        updateMasterGain();
        console.log('✅ Configurações restauradas');
        
        // Verifica se tem arquivos em cache
        if (!cachedProjectData.cachedAudioFiles || cachedProjectData.cachedAudioFiles.length === 0) {
            throw new Error('Nenhum arquivo de áudio em cache');
        }
        
        console.log('🔨 Criando AudioElements...');
        const newTracks = await createAudioTracksFromFiles(cachedProjectData.cachedAudioFiles);
        
        console.log(`✅ ${newTracks.length} tracks criadas!`);
        
        // Atualiza state
        state.tracks = newTracks;
        state.currentTime = 0;
        state.isPlaying = false;
        state.activeTab = 'mixer';
        
        history = [];
        historyIndex = -1;
        saveToHistory();
        
        hideLoadingOverlay();
        markProjectAsSaved();
        render();
        
        // Preload próximos
        suggestPreloadProjects(cachedProjectData.id);
        
        console.log('⚡⚡⚡ ========== CACHE CARREGADO COM SUCESSO ==========');
        
    } catch (err) {
        console.error('❌ ========== ERRO AO CARREGAR DO CACHE ==========');
        console.error('   - Erro:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao carregar do cache:\n\n' + err.message);
    }
}
// ========================================
// CRIAR TRACKS DE ARQUIVOS - VERSÃO CORRIGIDA
// ========================================

// ========================================
// CRIAR TRACKS DE ARQUIVOS - COM PAN MANUAL
// ========================================
async function createAudioTracksFromFiles(downloadedTracks) {
    console.log('🔨 ========== createAudioTracksFromFiles ==========');
    console.log('   - downloadedTracks:', downloadedTracks?.length);
    
    const newTracks = [];
    
    if (!downloadedTracks || !Array.isArray(downloadedTracks) || downloadedTracks.length === 0) {
        console.error('❌ downloadedTracks inválido ou vazio!');
        return newTracks;
    }
    
    for (let i = 0; i < downloadedTracks.length; i++) {
        const downloaded = downloadedTracks[i];
        
        if (!downloaded) {
            console.warn(`⚠️ Track ${i} é null/undefined`);
            continue;
        }
        
        console.log(`   📍 [${i + 1}/${downloadedTracks.length}] Processando...`);
        
        const { trackData, audioFile } = downloaded;
        
        if (!trackData) {
            console.error(`   ❌ Track ${i} sem trackData`);
            continue;
        }
        
        if (!audioFile) {
            console.error(`   ❌ Track ${i} (${trackData.name}) sem audioFile`);
            continue;
        }
        
        try {
            console.log(`   🔨 Criando AudioElement: ${trackData.name}`);
            
            const audioElement = await createAudioElement(audioFile);
            console.log('      ✅ AudioElement criado');
            
            const source = audioContext.createMediaElementSource(audioElement);
            const gainNode = audioContext.createGain();
            const splitter = audioContext.createChannelSplitter(2);
            const merger = audioContext.createChannelMerger(2);
            const leftGain = audioContext.createGain();
            const rightGain = audioContext.createGain();
            const analyserNode = audioContext.createAnalyser();
            
            analyserNode.fftSize = 256;
            analyserNode.smoothingTimeConstant = 0.8;
            
            source.connect(splitter);
            splitter.connect(leftGain, 0);
            splitter.connect(rightGain, 1);
            leftGain.connect(merger, 0, 0);
            rightGain.connect(merger, 0, 1);
            merger.connect(gainNode);
            gainNode.connect(analyserNode);
            analyserNode.connect(masterGainNode);
            
            console.log('      ✅ Nodes conectados');
            
            const track = {
                id: trackData.id,
                name: trackData.name,
                volume: trackData.volume || 75,
                pan: trackData.pan || 0,
                solo: trackData.solo || false,
                mute: trackData.mute || false,
                color: trackData.color || 'color-blue',
                originalFile: audioFile,
                audioElement: audioElement,
                gainNode: gainNode,
                leftGain: leftGain,
                rightGain: rightGain,
                splitter: splitter,
                merger: merger,
                sourceNode: source,
                analyserNode: analyserNode,
                vuLevel: 0,
                vuPeak: 0,
                vuClip: false
            };
            
            gainNode.gain.value = track.volume / 100;
            
            const leftGainValue = Math.max(0, 1 - track.pan);
            const rightGainValue = Math.max(0, 1 + track.pan);
            leftGain.gain.value = leftGainValue;
            rightGain.gain.value = rightGainValue;
            
            audioElement.addEventListener('timeupdate', () => {
                if (state.isPlaying) state.currentTime = audioElement.currentTime;
            });
            
            audioElement.addEventListener('ended', () => {
                if (state.isPlaying) {
                    const allEnded = state.tracks.every(t =>
                        !t.audioElement || t.audioElement.ended || t.audioElement.paused
                    );
                    if (allEnded) {
                        state.isPlaying = false;
                        stopBPMPulse();
                        render();
                    }
                }
            });
            
            newTracks.push(track);
            console.log(`      ✅ Track ${trackData.name} COMPLETA!`);
            
        } catch (error) {
            console.error(`   ❌ Erro ao criar track ${trackData.name}:`, error);
            console.error('      Stack:', error.stack);
        }
    }
    
    console.log('✅ ========== createAudioTracksFromFiles CONCLUÍDO ==========');
    console.log(`   - Total criadas: ${newTracks.length}/${downloadedTracks.length}`);
    
    return newTracks;
}
function suggestPreloadProjects(currentProjectId) {
    const currentIndex = state.savedProjects.findIndex(p => p.id === currentProjectId);
    
    if (currentIndex !== -1) {
        // Próximo
        if (currentIndex + 1 < state.savedProjects.length) {
            const nextProject = state.savedProjects[currentIndex + 1];
            if (nextProject.source === 'drive') {
                preloadQueue.add(nextProject.id);
            }
        }
        
        // Anterior
        if (currentIndex - 1 >= 0) {
            const prevProject = state.savedProjects[currentIndex - 1];
            if (prevProject.source === 'drive') {
                preloadQueue.add(prevProject.id);
            }
        }
    }
}

async function preloadAllProjects() {
    const driveProjects = state.savedProjects.filter(p => p.source === 'drive');
    
    if (driveProjects.length === 0) {
        showAlert('Nenhum projeto do Drive');
        return;
    }
    
    const confirmed = await showConfirm(
        `⚡ Pré-carregar ${driveProjects.length} projeto(s)?\n\n` +
        `Tempo estimado: ~${driveProjects.length * 10}s`
    );
    
    if (!confirmed) return;
    
    showLoadingOverlay();
    updateLoadingProgress(0, driveProjects.length, 'Preparando...');
    
    for (let i = 0; i < driveProjects.length; i++) {
        const project = driveProjects[i];
        updateLoadingProgress(i + 1, driveProjects.length, `Baixando ${project.name}...`);
        
        if (!projectCache.has(project.id)) {
            await preloadProjectFromDrive(project);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    hideLoadingOverlay();
    showAlert(`✅ ${driveProjects.length} projeto(s) prontos!\n\n⚡ Troca instantânea ativada!`);
}

async function exportProjectFromLibrary(projectId, event) {
    event.stopPropagation();
    
    const project = state.savedProjects.find(p => p.id === projectId);
    if (!project) return;
    
    if (project.source !== 'library' || !project.folderName || !libraryFolderHandle) {
        showAlert('❌ Só é possível exportar projetos da biblioteca local.');
        return;
    }
    
    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Exportando projeto completo...');
    
    try {
        // Abre pasta do projeto
        const projectFolder = await libraryFolderHandle.getDirectoryHandle(project.folderName);
        
        // Lê projeto.json
        const jsonHandle = await projectFolder.getFileHandle('projeto.json');
        const jsonFile = await jsonHandle.getFile();
        const jsonText = await jsonFile.text();
        const projectData = JSON.parse(jsonText);
        
        // Carrega os arquivos de áudio como base64
        const tracksWithAudio = [];
        
        for (let i = 0; i < projectData.tracks.length; i++) {
            const track = projectData.tracks[i];
            updateLoadingProgress(i + 1, projectData.tracks.length, `Carregando ${track.name}...`);
            
            if (track.filename) {
                try {
                    const audioHandle = await projectFolder.getFileHandle(track.filename);
                    const audioFile = await audioHandle.getFile();
                    const audioData = await fileToBase64(audioFile);
                    
                    tracksWithAudio.push({
                        ...track,
                        audioData: audioData,
                        filename: undefined // Remove referência ao arquivo
                    });
                } catch (err) {
                    console.error(`Erro ao carregar ${track.filename}:`, err);
                }
            }
        }
        
        // Cria novo .mtp com áudios inclusos
        const exportData = {
            ...projectData,
            tracks: tracksWithAudio,
            source: 'mobile',
            exportedAt: new Date().toLocaleString('pt-BR')
        };
        
        // Download
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}.mtp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        hideLoadingOverlay();
        showAlert(`✅ Projeto exportado!\n\n📱 Agora você pode importar este .mtp no celular.`);
        
    } catch (err) {
        console.error('Erro ao exportar:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao exportar projeto.');
    }
}

async function deleteProject(projectId, event) {
    event.stopPropagation();
    
    const project = state.savedProjects.find(p => p.id === projectId);
    if (!project) return;
    
    const confirmed = await showConfirm(
        `Deseja realmente excluir "${project.name}"?\n\n` +
        (project.source === 'library' ? '⚠️ A pasta será deletada do seu computador!' : '')
    );
    
    if (!confirmed) return;
    
    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Deletando projeto...');
    
    try {
        // Se é projeto da biblioteca (pasta física)
        if (project.source === 'library' && project.folderName && libraryFolderHandle) {
            try {
                await libraryFolderHandle.removeEntry(project.folderName, { recursive: true });
                console.log(`✅ Pasta "${project.folderName}" deletada do disco`);
            } catch (err) {
                console.error('❌ Erro ao deletar pasta:', err);
                hideLoadingOverlay();
                showAlert('❌ Erro ao deletar pasta do disco.\n\nVerifique as permissões.');
                return;
            }
        }
        
        // Remove da lista
        state.savedProjects = state.savedProjects.filter(p => p.id !== projectId);
        
        // Atualiza localStorage (para projetos mobile/importados)
        saveProjectsToLocalStorage();
        
        // Se era o projeto atual, limpa
        if (state.currentProject?.id === projectId) {
            state.currentProject = null;
        }
        
        hideLoadingOverlay();
        render();
        
        showAlert(`✅ Projeto "${project.name}" excluído com sucesso!`);
        
    } catch (err) {
        console.error('❌ Erro ao deletar projeto:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao deletar projeto.');
    }
}

// ========================================
// EXPORT PROJECT FILE
// ========================================

async function exportProjectFile() {
    if (!state.currentProject && state.tracks.length === 0) {
        showAlert('Nenhum projeto para exportar');
        return;
    }

    const projectData = state.currentProject || {
        name: 'Projeto Sem Nome',
        tracks: state.tracks.map(t => ({
            id: t.id,
            name: t.name,
            volume: t.volume,
            pan: t.pan,
            solo: t.solo,
            mute: t.mute,
            color: t.color,
            audioData: t.audioData
        })),
        markers: state.markers,
        markerShortcuts: state.markerShortcuts,
        duration: state.duration,
        masterVolume: state.masterVolume,
        masterMute: state.masterMute,
        bpm: state.bpm,
        key: state.key,
        fadeInTime: state.fadeInTime,
        fadeOutTime: state.fadeOutTime,
        createdAt: new Date().toLocaleString('pt-BR')
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectData.name}.mtp`;
    a.click();
    URL.revokeObjectURL(url);
    
    showAlert('Projeto exportado com sucesso!');
}

async function handleProjectImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Importando projeto...');

    try {
        const text = await file.text();
        const projectData = JSON.parse(text);
        
        // Validação: verifica se tem audioData
        const hasAudioData = projectData.tracks && 
                            projectData.tracks.length > 0 && 
                            projectData.tracks[0].audioData;
        
        const hasFilename = projectData.tracks && 
                           projectData.tracks.length > 0 && 
                           projectData.tracks[0].filename;
        
        if (!hasAudioData && !hasFilename) {
            hideLoadingOverlay();
            showAlert('❌ Arquivo .mtp inválido!\n\nO projeto não contém dados de áudio.');
            event.target.value = '';
            return;
        }
        
        // Se tem filename mas não audioData (projeto desktop)
        if (hasFilename && !hasAudioData) {
            hideLoadingOverlay();
            showAlert(
                '⚠️ Este projeto foi salvo no modo Desktop.\n\n' +
                'Ele contém apenas referências aos arquivos, não os áudios completos.\n\n' +
                'Para importar no celular:\n' +
                '1. Abra o projeto no PC\n' +
                '2. Use "Exportar Projeto" na biblioteca\n\n' +
                'Isso criará um .mtp com áudios inclusos.'
            );
            event.target.value = '';
            return;
        }
        
        // Se chegou aqui, tem audioData (importável!)
        projectData.id = Date.now();
        projectData.source = 'imported';
        projectData.importedAt = new Date().toLocaleString('pt-BR');
        
        // Adiciona à biblioteca
        state.savedProjects.push(projectData);
        
        // Salva no localStorage
        saveProjectsToLocalStorage();
        
        hideLoadingOverlay();
        
        // Muda para aba biblioteca
        state.activeTab = 'library';
        render();
        
        showAlert(`✅ Projeto "${projectData.name}" importado!\n\nClique nele para carregar.`);
        
    } catch (err) {
        console.error('Error importing project:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao importar projeto.\n\nVerifique se o arquivo .mtp é válido.');
    }
    
    event.target.value = '';
}
async function handleMultipleProjectImport(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    showLoadingOverlay();
    
    let importedCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        updateLoadingProgress(i + 1, files.length, `Importando ${file.name}...`);
        
        try {
            const text = await file.text();
            const projectData = JSON.parse(text);
            
            // Verifica se já existe (evita duplicatas)
            const exists = state.savedProjects.find(p => p.id === projectData.id);
            if (!exists) {
                projectData.source = 'imported';
                projectData.updatedAt = new Date().toLocaleString('pt-BR');
                state.savedProjects.push(projectData);
                importedCount++;
            }
            
        } catch (err) {
            console.error(`Erro ao importar ${file.name}:`, err);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    hideLoadingOverlay();
    
    if (importedCount > 0) {
        state.activeTab = 'library';
        render();
        showAlert(`✅ ${importedCount} projeto(s) importado(s) com sucesso!\n\nVeja na Biblioteca.`);
    } else {
        showAlert('⚠️ Nenhum projeto novo foi importado.\n\n(Projetos duplicados foram ignorados)');
    }
    
    event.target.value = '';
}
// ========================================
// EXPORT MIXDOWN
// ========================================

async function exportMixdown() {
    if (state.tracks.length === 0) {
        showAlert('Adicione tracks antes de exportar');
        return;
    }

    const format = await showExportModal();
    if (!format) return;

    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Renderizando mixdown...');

    try {
        const dest = audioContext.createMediaStreamDestination();
        masterGainNode.disconnect();
        masterGainNode.connect(dest);
        masterGainNode.connect(audioContext.destination);

        const mediaRecorder = new MediaRecorder(dest.stream, {
            mimeType: format === 'wav' ? 'audio/wav' : 'audio/webm;codecs=opus'
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        
        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: format === 'wav' ? 'audio/wav' : 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.currentProject?.name || 'mixdown'}.${format === 'wav' ? 'wav' : 'webm'}`;
            a.click();
            URL.revokeObjectURL(url);
            
            masterGainNode.disconnect();
            masterGainNode.connect(audioContext.destination);
            
            hideLoadingOverlay();
            showAlert('Mixdown exportado com sucesso!');
        };

        mediaRecorder.start();
        
        const wasPlaying = state.isPlaying;
        const originalTime = state.currentTime;
        
        seekToTime(0);
        await togglePlay();
        
        await new Promise((resolve) => {
            const checkEnd = setInterval(() => {
                if (!state.isPlaying || state.currentTime >= state.duration - 0.5) {
                    clearInterval(checkEnd);
                    mediaRecorder.stop();
                    if (!wasPlaying) {
                        stopWithFade();
                    }
                    seekToTime(originalTime);
                    resolve();
                }
            }, 100);
        });

    } catch (err) {
        console.error('Error exporting mixdown:', err);
        hideLoadingOverlay();
        showAlert('Erro ao exportar mixdown: ' + err.message);
    }
}

function showExportModal() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">Exportar Mixdown</h3>
                <div class="modal-body">
                    <label class="modal-label">Formato</label>
                    <select class="modal-select" id="export-format">
                        <option value="webm">WebM (Opus)</option>
                        <option value="wav">WAV (não comprimido)</option>
                    </select>
                    <p style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem;">
                        O mixdown será reproduzido do início ao fim automaticamente.
                    </p>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="modal-btn modal-btn-primary" data-action="confirm">Exportar</button>
                </div>
            </div>
        `;

        const formatSelect = overlay.querySelector('#export-format');
        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(formatSelect.value);
        });
        
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });

        document.body.appendChild(overlay);
    });
}
// ========================================
// MULTITRACK PRO - PARTE 5/5 FINAL
// Modals e Render Functions
// ========================================

// ========================================
// MODALS
// ========================================

function showPrompt(title, defaultValue = '') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">${title}</h3>
                <div class="modal-body">
<input type="text" class="modal-input" value="${defaultValue}">                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="modal-btn modal-btn-primary" data-action="confirm">OK</button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('.modal-input');
        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');

        const close = (value) => {
            overlay.remove();
            resolve(value);
        };

        confirmBtn.addEventListener('click', () => close(input.value.trim() || null));
        cancelBtn.addEventListener('click', () => close(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') close(input.value.trim() || null);
            if (e.key === 'Escape') close(null);
        });

        document.body.appendChild(overlay);
        input.focus();
        input.select();
    });
}

function showAlert(message) {
    // Se mensagem começa com ✅, usa toast success
    if (message.startsWith('✅')) {
        return successToast(message.replace('✅', '').trim());
    }
    
    // Se mensagem começa com ❌, usa toast error
    if (message.startsWith('❌')) {
        return errorToast(message.replace('❌', '').trim());
    }
    
    // Se mensagem começa com ⚠️, usa toast warning
    if (message.startsWith('⚠️')) {
        return warningToast(message.replace('⚠️', '').trim());
    }
    
    // Caso contrário, usa modal tradicional (para mensagens longas)
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">Aviso</h3>
                <div class="modal-body">
                    <p class="modal-message">${message}</p>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-primary" data-action="ok">OK</button>
                </div>
            </div>
        `;

        const okBtn = overlay.querySelector('[data-action="ok"]');
        okBtn.addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
        document.body.appendChild(overlay);
    });
}

function showConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">Confirmar</h3>
                <div class="modal-body">
                    <p class="modal-message">${message}</p>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="modal-btn modal-btn-danger" data-action="confirm">Confirmar</button>
                </div>
            </div>
        `;

        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
        document.body.appendChild(overlay);
    });
}

function showMusicInfoModal() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">Informações da Música</h3>
                <div class="modal-body">
                    <label class="modal-label">BPM (Batidas por Minuto)</label>
                    <input type="number" class="modal-input" id="modal-bpm" value="120" min="40" max="240">
                    
                    <label class="modal-label">Tom / Tonalidade</label>
                    <select class="modal-select" id="modal-key">
                        ${musicalKeys.map(k => `<option value="${k}">${k}</option>`).join('')}
                    </select>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="modal-btn modal-btn-primary" data-action="confirm">OK</button>
                </div>
            </div>
        `;

        const bpmInput = overlay.querySelector('#modal-bpm');
        const keySelect = overlay.querySelector('#modal-key');
        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve({
                bpm: parseInt(bpmInput.value) || 120,
                key: keySelect.value
            });
        });
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });
        document.body.appendChild(overlay);
        bpmInput.focus();
        bpmInput.select();
    });
}
// RENOMEAR TRACK
async function renameTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const newName = await showPrompt('Renomear Track:', track.name);
    if (!newName) return;
    
    track.name = newName;
    saveToHistory();
    render();
}

// CARREGAR PASTA MP3 NA BIBLIOTECA
async function loadFolderToLibrary() {
    if (!supportsFileSystem) {
        document.getElementById('folderInputLibrary').click();
        return;
    }
    
    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        
        showLoadingOverlay();
        const files = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
                const file = await entry.getFile();
                files.push(file);
            }
        }
        
        if (files.length === 0) {
            hideLoadingOverlay();
            showAlert('❌ Nenhum arquivo de áudio encontrado');
            return;
        }
        
        await clearCurrentProject();
        await importFiles(files);
        state.activeTab = 'mixer';
        hideLoadingOverlay();
        render();
    } catch (err) {
        hideLoadingOverlay();
        if (err.name !== 'AbortError') {
            showAlert('❌ Erro ao carregar pasta');
        }
    }
}

async function handleFolderInputLibrary(event) {
    const files = Array.from(event.target.files).filter(f => 
        f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)
    );
    
    if (files.length === 0) {
        showAlert('❌ Nenhum arquivo de áudio encontrado');
        return;
    }
    
    await clearCurrentProject();
    await importFiles(files);
    state.activeTab = 'mixer';
    render();
    event.target.value = '';
}
// ========================================
// RENDER FUNCTIONS
// ========================================

function render() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="header">
            <div class="header-top">
                <div class="header-logo">
                    <i data-lucide="music" class="logo-icon"></i>
                    <div>
                        <div class="logo-text">MultiTrack Pro</div>
                        ${state.currentProject ? `
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div class="project-name">${state.currentProject.name}</div>
                                ${getProjectStatusBadge()}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                    ${state.tracks.length > 0 ? `
                        <div class="project-info-display">
                            <div class="info-item">
                                <span class="info-label">BPM:</span>
                                <span class="info-value">${state.bpm}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tom:</span>
                                <span class="info-value">${state.key}</span>
                            </div>
                        </div>
                    ` : ''}
                    <div class="time-display">${formatTime(state.currentTime)} / ${formatTime(state.duration)}</div>
                </div>
            </div>
            
            <div class="transport-controls">
                <div class="undo-redo-controls">
                    <button class="undo-btn" ${historyIndex <= 0 ? 'disabled' : ''}>
                        <i data-lucide="rotate-ccw"></i>
                        <span>Undo</span>
                    </button>
                    <button class="redo-btn" ${historyIndex >= history.length - 1 ? 'disabled' : ''}>
                        <i data-lucide="rotate-cw"></i>
                        <span>Redo</span>
                    </button>
                </div>
                
                <button class="transport-btn skip-back-btn">
                    <i data-lucide="skip-back"></i>
                </button>
                <button class="transport-btn play-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
                    <i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>
                </button>
                <button class="transport-btn stop-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
                    <i data-lucide="square"></i>
                </button>
                <button class="transport-btn skip-forward-btn">
                    <i data-lucide="skip-forward"></i>
                </button>
            </div>
        </div>

        <div class="waveform-container">
            <canvas id="waveform"></canvas>
            <div class="markers-container">
                ${state.markers.map(marker => {
                    const shortcut = state.markerShortcuts[marker.id];
                    return `
                    <div class="marker" style="left: ${(marker.time / state.duration) * 100}%" data-marker-id="${marker.id}">
                        <div class="marker-label">${marker.name}${shortcut ? ` (${shortcut})` : ''}</div>
                        <button class="marker-delete" data-marker-id="${marker.id}">×</button>
                    </div>
                `}).join('')}
            </div>
        </div>

        <div class="tabs">
            <button class="tab-btn ${state.activeTab === 'mixer' ? 'active' : ''}" data-tab="mixer">Mixer</button>
            <button class="tab-btn ${state.activeTab === 'library' ? 'active' : ''}" data-tab="library">Biblioteca</button>
            <button class="tab-btn ${state.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
        </div>

        <div class="content">
            ${state.activeTab === 'mixer' ? renderMixer() : state.activeTab === 'library' ? renderLibrary() : renderSettings()}
        </div>

        <div class="bottom-nav">
            <button class="nav-btn ${state.activeTab === 'mixer' ? 'active' : ''}" data-tab="mixer">
                <i data-lucide="music"></i>
                <span>Mixer</span>
            </button>
            <button class="nav-btn ${state.activeTab === 'library' ? 'active' : ''}" data-tab="library">
                <i data-lucide="library"></i>
                <span>Biblioteca</span>
            </button>
            <button class="nav-btn ${state.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
                <i data-lucide="settings"></i>
                <span>Settings</span>
            </button>
        </div>
    `;

    lucide.createIcons();
    drawWaveform();
    attachDynamicEventListeners();
}

function renderMixer() {
    return `
        <div class="tab-content active">
            <div class="mixer-controls">
                <div class="mixer-buttons">
                    <button class="import-btn import-tracks-btn">
                        <i data-lucide="music"></i>
                        <span>Importar Tracks</span>
                    </button>
                    <button class="import-btn import-folder-btn">
                        <i data-lucide="folder-open"></i>
                        <span>Importar Pasta</span>
                    </button>
                    <button class="import-btn add-marker-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
                        <i data-lucide="bookmark"></i>
                        <span>Add Marker</span>
                    </button>
                    <button class="import-btn save-btn ${state.isProjectModified ? 'modified' : ''} ${!state.currentProject && state.tracks.length > 0 ? 'new-project' : ''}" ${state.tracks.length === 0 ? 'disabled' : ''}>
    <i data-lucide="save"></i>
    <span>
        ${!state.currentProject && state.tracks.length > 0 ? 'Salvar Novo Projeto' : 
          state.isProjectModified ? 'Salvar *' : 'Salvar'}
    </span>
</button>
<button class="import-btn save-as-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
    <i data-lucide="copy"></i>
    <span>Salvar Como...</span>
</button>
                    <button class="import-btn export-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
                        <i data-lucide="download"></i>
                        <span>Export Mix</span>
                    </button>
                    <button class="import-btn fade-config-btn">
                        <i data-lucide="activity"></i>
                        <span>Fade In/Out</span>
                    </button>
                </div>
            </div>

            <div class="tracks-container">
                ${state.tracks.length === 0 ? `
                    <div class="empty-state">
                        <div>
                            <i data-lucide="music"></i>
                            <p>Nenhuma track carregada</p>
                            <p style="font-size: 0.875rem; margin-top: 0.5rem;">Use os botões acima para importar</p>
                        </div>
                    </div>
                ` : `
                    <div class="tracks-wrapper">
                        ${state.tracks.map(track => renderTrack(track)).join('')}
                        ${renderMasterTrack()}
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderTrack(track) {
    const hasSolo = state.tracks.some(t => t.solo);
    const effectiveMute = track.mute || (hasSolo && !track.solo);
    const isCenter = Math.abs(track.pan) < 0.05;
    
    return `
        <div class="track-channel ${effectiveMute ? 'muted' : ''}" data-track-id="${track.id}">
            <div style="display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.75rem; height: 24px;">
    <div class="track-name" style="flex: 1; margin-bottom: 0;">${track.name}</div>
    <button class="track-rename-btn" data-track-id="${track.id}" title="Renomear">
        <i data-lucide="edit-2" style="width: 11px; height: 11px;"></i>
    </button>
</div>
            
            <div class="vu-meter-container" data-vu-track="${track.id}">
                <div class="vu-meter-label">VU</div>
                <div class="vu-meter">
                    <div class="vu-meter-bar"></div>
                    <div class="vu-meter-peak"></div>
                    <div class="vu-meter-clip"></div>
                </div>
            </div>
            
            <div class="pan-control">
                <div class="pan-label">PAN</div>
                <div class="pan-knob-container" data-track-id="${track.id}" ${isCenter ? 'data-pan-center="true"' : ''}>
                    <div class="pan-knob-visual">
                        <div class="pan-center-dot"></div>
                        <div class="pan-knob-indicator" style="transform: translateX(-50%) rotate(${track.pan * 135}deg)"></div>
                    </div>
                </div>
                <div class="pan-value">${formatPan(track.pan)}</div>
            </div>

            <div class="fader-container">
                <div class="fader-wrapper" data-track-id="${track.id}">
                    <div class="fader-track"></div>
                    <div class="fader-level ${track.color}" style="height: ${track.volume}%"></div>
                    <div class="fader-handle" style="bottom: calc(${track.volume}% - 24px)"></div>
                </div>
            </div>

            <div class="volume-value">${track.volume}</div>

            <button class="track-button solo-btn ${track.solo ? 'active' : ''}" data-track-id="${track.id}" data-action="solo">
                S
            </button>
            <button class="track-button mute-btn ${track.mute ? 'active' : ''}" data-track-id="${track.id}" data-action="mute">
                M
            </button>
        </div>
    `;
}

function renderMasterTrack() {
    return `
        <div class="track-channel master-track ${state.masterMute ? 'muted' : ''}">
            <div class="track-name">MASTER</div>
            
            <div style="height: 152px;"></div>

            <div class="fader-container">
                <div class="fader-wrapper master-fader-wrapper">
                    <div class="fader-track"></div>
                    <div class="fader-level" style="height: ${state.masterVolume}%"></div>
                    <div class="fader-handle" style="bottom: calc(${state.masterVolume}% - 28px)"></div>
                </div>
            </div>

            <div class="volume-value">${state.masterVolume}</div>

            <button class="track-button mute-btn ${state.masterMute ? 'active' : ''}" data-action="master-mute">
                M
            </button>
        </div>
    `;
}

function renderLibrary() {
    return `
        <div class="tab-content active">
            <div class="library-content">
                ${state.savedProjects.length === 0 ? `
                    <div class="empty-state">
                        <div>
                            <i data-lucide="library"></i>
                            <p>Nenhum projeto salvo</p>
                            <p style="font-size: 0.875rem; margin-top: 0.5rem;">Configure a biblioteca nas Settings</p>
                            <button class="import-btn import-project-btn" style="margin-top: 1rem;">
                                <i data-lucide="upload"></i>
                                <span>Importar Projeto (.mtp)</span>
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 class="library-title">Projetos Salvos</h3>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="import-btn import-project-btn" onclick="document.getElementById('multipleProjectImportInput').click()">
                                <i data-lucide="files"></i>
                                <span>Importar Projetos (.mtp)</span>
                            </button>
                             <button class="import-btn" onclick="preloadAllProjects()" style="background: #8b5cf6;">
    <i data-lucide="zap"></i>
    <span>⚡ Pré-carregar Todos (Modo Ao Vivo)</span>
</button>
                            <button class="import-btn load-folder-library-btn">
                                <i data-lucide="folder-open"></i>
                                <span>Carregar Pasta MP3</span>
                            </button>
                        </div>
                    </div>
                    <div class="projects-list">
                        ${state.savedProjects.map(project => `
                            <div class="project-card ${state.currentProject?.id === project.id ? 'active' : ''}" data-project-id="${project.id}">
                                <div class="project-icon">
                                    <i data-lucide="music"></i>
                                </div>
                                <div class="project-info">
                                    <div class="project-title">${project.name}</div>
                                    <div class="project-meta">
                                        ${project.tracks.length} tracks • ${project.markers?.length || 0} markers • BPM ${project.bpm} • ${project.updatedAt || project.createdAt}
                                    </div>
                                </div>
                                <div style="display: flex; gap: 0.25rem;">
                                    ${project.source === 'library' ? `
                                        <button class="export-project-btn" data-project-id="${project.id}" title="Exportar como .mtp completo">
                                            <i data-lucide="download"></i>
                                        </button>
                                    ` : ''}
                                    <button class="delete-btn" data-project-id="${project.id}">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderSettings() {
    return `
        <div class="tab-content active">
            <div class="settings-content">
                <div class="settings-section">
                    <h3 class="settings-section-title">
                        <i data-lucide="folder"></i>
                        Biblioteca de Projetos
                    </h3>
                    
                    <!-- Seletor de Modo -->
                    <div class="settings-item">
                        <label class="settings-label">Modo de Armazenamento</label>
                        <p class="settings-description">
                            Escolha onde seus projetos serão salvos
                        </p>
                        <select class="modal-select" id="storage-mode-select">
                            <option value="local" ${state.storageMode === 'local' ? 'selected' : ''}>
                                📱 Portátil (Download/Upload .mtp)
                            </option>
                            <option value="folder" ${state.storageMode === 'folder' ? 'selected' : ''} ${!supportsFileSystem ? 'disabled' : ''}>
                                💻 Pasta Local ${!supportsFileSystem ? '(Indisponível)' : ''}
                            </option>
                            <option value="drive" ${state.storageMode === 'drive' ? 'selected' : ''}>
                                ☁️ Google Drive ${state.googleDriveConnected ? '(Conectado)' : ''}
                            </option>
                        </select>
                        ${state.storageMode !== 'drive' && !state.googleDriveConnected ? `
                            <p style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem;">
                                💡 Selecione "Google Drive" para conectar sua conta
                            </p>
                        ` : ''}
                    </div>
                    
                    <!-- Informações do modo atual -->
                    <div class="settings-item" id="storage-info-container">
                        ${renderStorageInfo()}
                    </div>
                </div>
                
                <!-- Google Drive Status -->
                ${state.googleDriveConnected ? `
                    <div class="settings-section">
                        <h3 class="settings-section-title">
                            <i data-lucide="cloud"></i>
                            Status do Google Drive
                        </h3>
                        <div class="google-drive-status">
                            <div class="status-item">
                                <strong>Conta:</strong>
                                <span>${state.googleDriveEmail}</span>
                            </div>
                            <div class="status-item">
                                <strong>Projetos na nuvem:</strong>
                                <span>${state.savedProjects.filter(p => p.source === 'drive').length}</span>
                            </div>
                            ${state.lastSyncTime ? `
                                <div class="status-item">
                                    <strong>Última sincronização:</strong>
                                    <span>${state.lastSyncTime}</span>
                                </div>
                            ` : ''}
                        </div>
                        <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
                            <button class="import-btn" onclick="loadProjectsFromDrive()">
                                <i data-lucide="refresh-cw"></i>
                                <span>Sincronizar Agora</span>
                            </button>
                            <button class="modal-btn modal-btn-secondary" onclick="disconnectGoogleDrive()">
                                Desconectar
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Ajuda -->
                <div class="settings-section">
                    <h3 class="settings-section-title">
                        <i data-lucide="info"></i>
                        Sobre os Modos
                    </h3>
                    <div class="storage-mode-help">
                        <div class="help-item">
                            <strong>📱 Modo Portátil:</strong>
                            <p>• Projetos salvos como arquivos .mtp</p>
                            <p>• Download/upload manual</p>
                            <p>• Funciona em qualquer dispositivo</p>
                        </div>
                        <div class="help-item">
                            <strong>💻 Modo Pasta Local:</strong>
                            <p>• Salvamento automático em pasta</p>
                            <p>• Acesso rápido (só desktop)</p>
                            <p>• Arquivos separados (fácil backup)</p>
                        </div>
                        <div class="help-item">
                            <strong>☁️ Modo Google Drive:</strong>
                            <p>• Salvamento na nuvem</p>
                            <p>• Sincronização automática</p>
                            <p>• Acesso de qualquer lugar</p>
                            ${!state.googleDriveConnected ? `
                                <p style="color: #fbbf24; margin-top: 0.5rem;">⚠️ Requer conexão com conta Google</p>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
// NOVA FUNÇÃO - Renderiza informações do modo de storage atual
function renderStorageInfo() {
    // MODO GOOGLE DRIVE
    if (state.storageMode === 'drive') {
        if (state.googleDriveConnected) {
            return `
                <label class="settings-label">Google Drive Conectado</label>
                <div class="library-path-display" style="background: #059669;">
                    <i data-lucide="cloud-check"></i>
                    <div class="library-path-text">
                        <strong>${state.googleDriveEmail}</strong>
                    </div>
                </div>
                <p class="settings-description" style="color: #10b981; margin-top: 0.5rem;">
                    ✅ ${state.savedProjects.filter(p => p.source === 'drive').length} projeto(s) na nuvem
                </p>
            `;
        } else {
            return `
                <label class="settings-label">Google Drive</label>
                <div class="library-path-display">
                    <i data-lucide="cloud-off"></i>
                    <div class="library-path-text">
                        <strong>Conectando...</strong>
                    </div>
                </div>
                <p class="settings-description" style="color: #9ca3af; margin-top: 0.5rem;">
                    ⏳ Aguarde a conexão com o Google Drive
                </p>
            `;
        }
    }
    
    // MODO PASTA LOCAL
    if (state.storageMode === 'folder' && supportsFileSystem && state.libraryPath) {
        return `
            <label class="settings-label">Pasta Atual</label>
            <div class="library-path-display">
                <i data-lucide="folder-open"></i>
                <div class="library-path-text">
                    <strong>${state.libraryPath}</strong>
                </div>
            </div>
            <button class="select-library-btn">
                <i data-lucide="folder-plus"></i>
                <span>Trocar Pasta</span>
            </button>
            <p class="settings-description" style="margin-top: 0.5rem; color: #10b981;">
                ✅ ${state.savedProjects.filter(p => p.source === 'library').length} projeto(s) na pasta local
            </p>
        `;
    }
    
    // MODO PORTÁTIL
    return `
        <label class="settings-label">Modo Portátil Ativo</label>
        <div class="library-path-display">
            <i data-lucide="smartphone"></i>
            <div class="library-path-text">
                <strong>Download/Upload Manual</strong>
            </div>
        </div>
        <p class="settings-description" style="margin-top: 0.5rem;">
            📱 Use "Salvar" para baixar .mtp<br>
            📂 Use "Importar .mtp" para carregar projetos
        </p>
        <p class="settings-description" style="color: #10b981;">
            ✅ ${state.savedProjects.filter(p => p.source === 'mobile' || p.source === 'imported').length} projeto(s) importado(s)
        </p>
    `;
}

// ========================================
// DYNAMIC EVENT LISTENERS - PAN MELHORADO
// ========================================

// ========================================
// DYNAMIC EVENT LISTENERS - VERSÃO COMPLETA ATUALIZADA
// ========================================

function attachDynamicEventListeners() {
    // ========================================
    // WAVEFORM SCRUBBING - SIMPLIFICADO E FUNCIONAL
    // ========================================
    const waveformContainer = document.querySelector('.waveform-container');
    if (waveformContainer) {
        let isWaveformDragging = false;
        
        waveformContainer.addEventListener('mousedown', (e) => {
            // Ignora cliques em markers
            if (e.target.closest('.marker') || e.target.closest('.marker-delete')) return;
            
            isWaveformDragging = true;
            handleWaveformInteraction(e);
            document.body.style.cursor = 'ew-resize';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isWaveformDragging) {
                handleWaveformInteraction(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isWaveformDragging) {
                isWaveformDragging = false;
                document.body.style.cursor = '';
            }
        });
    }

    // ========================================
    // FADERS (NON-MASTER) - MOUSE GLOBAL
    // ========================================
    document.querySelectorAll('.fader-wrapper[data-track-id]').forEach(wrapper => {
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        const trackId = parseFloat(wrapper.dataset.trackId);
        
        wrapper.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            const track = state.tracks.find(t => t.id === trackId);
            startY = e.clientY;
            startValue = track ? track.volume : 75;
            wrapper.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            const sensitivity = 0.6;
            const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
            handleVolumeChange(trackId, newValue);
        });
        
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            wrapper.classList.remove('dragging');
            document.body.style.cursor = '';
        });
        
        // Touch events
        wrapper.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            isDragging = true;
            const track = state.tracks.find(t => t.id === trackId);
            const touch = e.touches[0];
            startY = touch.clientY;
            startValue = track ? track.volume : 75;
            wrapper.classList.add('dragging');
            e.preventDefault();
        }, { passive: false });
        
        wrapper.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.stopPropagation();
            const touch = e.touches[0];
            const deltaY = startY - touch.clientY;
            const sensitivity = 0.6;
            const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
            handleVolumeChange(trackId, newValue);
            e.preventDefault();
        }, { passive: false });
        
        wrapper.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            wrapper.classList.remove('dragging');
        });
    });

    // ========================================
    // PAN KNOBS - MOUSE GLOBAL CORRIGIDO
    // ========================================
    document.querySelectorAll('.pan-knob-container[data-track-id]').forEach(container => {
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        const trackId = parseFloat(container.dataset.trackId);
        
        container.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            const track = state.tracks.find(t => t.id === trackId);
            startY = e.clientY;
            startValue = track ? track.pan : 0;
            container.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            const sensitivity = 0.01; // AUMENTADO para melhor controle
            let newValue = startValue + deltaY * sensitivity;
            
            // Snap ao centro
            if (Math.abs(newValue) < 0.05) newValue = 0;
            newValue = Math.max(-1, Math.min(1, newValue));
            
            handlePanChange(trackId, newValue);
        });
        
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove('dragging');
            document.body.style.cursor = '';
        });
        
        // Touch events
        container.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            isDragging = true;
            const track = state.tracks.find(t => t.id === trackId);
            const touch = e.touches[0];
            startY = touch.clientY;
            startValue = track ? track.pan : 0;
            container.classList.add('dragging');
            e.preventDefault();
        }, { passive: false });
        
        container.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.stopPropagation();
            const touch = e.touches[0];
            const deltaY = startY - touch.clientY;
            const sensitivity = 0.006;
            let newValue = startValue + deltaY * sensitivity;
            
            if (Math.abs(newValue) < 0.08) newValue = 0;
            newValue = Math.max(-1, Math.min(1, newValue));
            
            handlePanChange(trackId, newValue);
            e.preventDefault();
        }, { passive: false });
        
        container.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove('dragging');
        });
    });

    // ========================================
    // MASTER FADER - MOUSE GLOBAL
    // ========================================
    const masterWrapper = document.querySelector('.master-fader-wrapper');
    if (masterWrapper) {
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        
        masterWrapper.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            startY = e.clientY;
            startValue = state.masterVolume;
            masterWrapper.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            const sensitivity = 0.6;
            const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
            handleMasterVolumeChange(newValue);
        });
        
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            masterWrapper.classList.remove('dragging');
            document.body.style.cursor = '';
        });
        
        // Touch events
        masterWrapper.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            isDragging = true;
            const touch = e.touches[0];
            startY = touch.clientY;
            startValue = state.masterVolume;
            masterWrapper.classList.add('dragging');
            e.preventDefault();
        }, { passive: false });
        
        masterWrapper.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.stopPropagation();
            const touch = e.touches[0];
            const deltaY = startY - touch.clientY;
            const sensitivity = 0.6;
            const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
            handleMasterVolumeChange(newValue);
            e.preventDefault();
        }, { passive: false });
        
        masterWrapper.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            masterWrapper.classList.remove('dragging');
        });
    }

    // ========================================
    // TRACK BUTTONS (SOLO/MUTE)
    // ========================================
    document.querySelectorAll('.track-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'master-mute') {
                toggleMasterMute();
            } else {
                const trackId = parseFloat(e.target.dataset.trackId);
                if (action === 'solo') {
                    toggleSolo(trackId);
                } else if (action === 'mute') {
                    toggleMute(trackId);
                }
            }
        });
    });

    // ========================================
    // MARKERS
    // ========================================
    document.querySelectorAll('.marker').forEach(marker => {
        marker.addEventListener('click', (e) => {
            if (!e.target.closest('.marker-delete')) {
                const markerId = parseInt(marker.dataset.markerId);
                const markerData = state.markers.find(m => m.id === markerId);
                if (markerData) {
                    seekToMarker(markerData.time);
                }
            }
        });
    });

    document.querySelectorAll('.marker-delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const markerId = parseInt(button.dataset.markerId);
            deleteMarker(markerId, e);
        });
    });

    // ========================================
    // PROJECTS (BIBLIOTECA)
    // ========================================
    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn') && !e.target.closest('.export-project-btn')) {
                const projectId = parseInt(card.dataset.projectId);
                const project = state.savedProjects.find(p => p.id === projectId);
                if (project) {
                    loadProject(project);
                }
            }
        });
    });

    document.querySelectorAll('.export-project-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const projectId = parseInt(button.dataset.projectId);
            exportProjectFromLibrary(projectId, e);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const projectId = parseInt(button.dataset.projectId);
            deleteProject(projectId, e);
        });
    });

    // ========================================
    // STORAGE MODE SELECT
    // ========================================
    const storageModeSelect = document.getElementById('storage-mode-select');
    if (storageModeSelect) {
        storageModeSelect.addEventListener('change', async (e) => {
            const newMode = e.target.value;
            
            if (newMode === 'folder' && supportsFileSystem) {
                const success = await setupLibraryFolder();
                if (success) {
                    state.storageMode = 'folder';
                    showAlert('✅ Mudado para Modo Pasta Local!\n\nAgora seus projetos serão salvos diretamente na pasta selecionada.');
                    render();
                } else {
                    e.target.value = state.storageMode;
                }
            } 
            
            else if (newMode === 'drive') {
                if (state.googleDriveConnected) {
                    const confirmed = await showConfirm(
                        '✅ Google Drive já está conectado!\n\n' +
                        `📧 ${state.googleDriveEmail}\n\n` +
                        'Deseja mudar para este modo de armazenamento?'
                    );
                    
                    if (confirmed) {
                        state.storageMode = 'drive';
                        const config = loadLibraryConfig();
                        config.storageMode = 'drive';
                        saveLibraryConfig(config);
                        showAlert('✅ Modo Google Drive ativado!\n\nSeus projetos serão salvos na nuvem.');
                        render();
                    } else {
                        e.target.value = state.storageMode;
                    }
                } else {
                    console.log('🔐 Iniciando conexão com Google Drive...');
                    await connectGoogleDrive();
                    
                    if (state.googleDriveConnected) {
                        state.storageMode = 'drive';
                        const config = loadLibraryConfig();
                        config.storageMode = 'drive';
                        saveLibraryConfig(config);
                        console.log('✅ Google Drive conectado e modo ativado!');
                        render();
                    } else {
                        console.log('⚠️ Conexão cancelada ou falhou');
                        e.target.value = state.storageMode;
                        render();
                    }
                }
            } 
            
            else if (newMode === 'local') {
                const confirmed = await showConfirm(
                    '⚠️ Mudar para Modo Portátil?\n\n' +
                    'Você precisará baixar/carregar arquivos .mtp manualmente.\n\n' +
                    'Os projetos da pasta local não serão apagados.'
                );
                
                if (confirmed) {
                    state.storageMode = 'local';
                    libraryFolderHandle = null;
                    state.libraryPath = null;
                    const config = loadLibraryConfig();
                    config.libraryPath = null;
                    config.storageMode = 'local';
                    saveLibraryConfig(config);
                    state.savedProjects = state.savedProjects.filter(p => 
                        p.source !== 'library'
                    );
                    showAlert('✅ Mudado para Modo Portátil!\n\nUse "Salvar" para baixar projetos como .mtp');
                    render();
                } else {
                    e.target.value = state.storageMode;
                }
            }
        });
    }
}
// ========================================
// FUNÇÕES FALTANTES - ADICIONE AQUI
// ========================================

// Toggle Master Mute
function toggleMasterMute() {
    state.masterMute = !state.masterMute;
    updateMasterGain();
    saveToHistory();
    markProjectAsModified();
    render();
}

// Badge de status do projeto
function getProjectStatusBadge() {
    if (!state.currentProject) return '';
    
    const badges = [];
    
    // Badge de modificado
    if (state.isProjectModified) {
        badges.push('<span class="project-badge modified">Modificado</span>');
    }
    
    // Badge de fonte
    if (state.currentProject.source === 'drive') {
        badges.push('<span class="project-badge drive">☁️ Drive</span>');
    } else if (state.currentProject.source === 'library') {
        badges.push('<span class="project-badge library">📁 Local</span>');
    }
    
    return badges.join('');
}
