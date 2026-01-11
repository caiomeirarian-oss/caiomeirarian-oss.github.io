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
// Detecção de plataforma
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const supportsFileSystem = 'showDirectoryPicker' in window && !isMobile;
// File System API
let projectFolderHandle = null;

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
    libraryPath: null
};

const trackColors = ['color-yellow', 'color-blue', 'color-green', 'color-red', 'color-purple', 'color-pink', 'color-indigo', 'color-orange'];
const musicalKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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

function initializeApp() {
    lucide.createIcons();
    loadProjectsFromLocalStorage();
}

// ========================================
// FILE SYSTEM API SUPPORT
// ========================================

function checkFileSystemAPISupport() {
    if (supportsFileSystem) {
        console.log('✅ File System Access API suportada! (Modo Desktop)');
    } else {
        console.log('📱 Modo Mobile/Fallback ativado (Download/Upload de arquivos)');
    }
}

function loadLibraryPath() {
    const savedPath = localStorage.getItem('libraryPath');
    if (savedPath) {
        state.libraryPath = savedPath;
    }
}

async function selectProjectsLibrary() {
    // Se não suporta File System API, usa fallback
    if (!supportsFileSystem) {
        showAlert('💡 No Android, use "Salvar" para baixar projetos (.mtp) e "Importar .mtp" para carregá-los.\n\n✅ Seus projetos também são salvos automaticamente no navegador!');
        return false;
    }

    try {
        // Tenta diferentes pontos de partida dependendo do sistema
        const options = {
            mode: 'readwrite'
        };
        
        // Tenta 'downloads' primeiro, depois 'music', depois 'documents'
        const startLocations = ['downloads', 'music', 'documents'];
        
        for (const location of startLocations) {
            try {
                options.startIn = location;
                projectsLibraryHandle = await window.showDirectoryPicker(options);
                break; // Se conseguiu, sai do loop
            } catch (err) {
                if (err.name === 'AbortError') throw err; // Usuário cancelou
                // Tenta próxima localização
                continue;
            }
        }
        
        // Se ainda não conseguiu, tenta sem startIn
        if (!projectsLibraryHandle) {
            delete options.startIn;
            projectsLibraryHandle = await window.showDirectoryPicker(options);
        }
        
        state.libraryPath = projectsLibraryHandle.name;
        localStorage.setItem('libraryPath', state.libraryPath);
        
        await loadProjectsFromFolder();
        
        showAlert(`✅ Biblioteca configurada: ${projectsLibraryHandle.name}\n\n📁 Seus projetos serão salvos nesta pasta!`);
        render();
        return true;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Erro ao selecionar pasta:', err);
            showAlert('❌ Erro ao selecionar pasta.\n\n💡 Seus projetos serão salvos apenas no navegador. Use "Exportar" para fazer backup!');
        }
        return false;
    }
}

// Carrega projetos da pasta selecionada
async function loadProjectsFromFolder() {
    if (!projectsLibraryHandle) return;
    
    showLoadingOverlay();
    updateLoadingProgress(0, 1, 'Carregando projetos da pasta...');
    
    const projects = [];
    
    try {
        for await (const entry of projectsLibraryHandle.values()) {
            if (entry.kind === 'directory') {
                try {
                    const projectFolder = await projectsLibraryHandle.getDirectoryHandle(entry.name);
                    const fileHandle = await projectFolder.getFileHandle('projeto.json');
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const projectData = JSON.parse(text);
                    
                    projectData.folderName = entry.name;
                    projectData.source = 'folder'; // Marca como vindo da pasta
                    projects.push(projectData);
                } catch (err) {
                    console.log(`Pasta ${entry.name} não contém projeto.json`);
                }
            }
        }
        
        // Mescla com projetos do localStorage
        const localProjects = loadProjectsFromLocalStorage() || [];
        const mergedProjects = [...projects];
        
        // Adiciona projetos locais que não estão na pasta
        localProjects.forEach(localProj => {
            if (!projects.find(p => p.id === localProj.id)) {
                localProj.source = 'localStorage';
                mergedProjects.push(localProj);
            }
        });
        
        state.savedProjects = mergedProjects;
        hideLoadingOverlay();
        render();
    } catch (err) {
        console.error('Erro ao carregar projetos:', err);
        hideLoadingOverlay();
        showAlert('Erro ao carregar projetos da pasta');
    }
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
        if (e.target.closest('.save-btn')) saveCurrentProject();
        if (e.target.closest('.add-marker-btn')) addMarker();
        if (e.target.closest('.export-btn')) exportMixdown();
        if (e.target.closest('.fade-config-btn')) configureFade();
        if (e.target.closest('.import-project-btn')) document.getElementById('projectImportInput').click();
        if (e.target.closest('.select-library-btn')) selectProjectsLibrary();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('folderInput').addEventListener('change', handleFolderUpload);
    document.getElementById('projectImportInput').addEventListener('change', handleProjectImport);

    // Waveform scrubbing
    let isScrubbing = false;
    document.addEventListener('mousedown', (e) => {
        if (e.target.id === 'waveform' || e.target.closest('.waveform-container')) {
            isScrubbing = true;
            handleWaveformInteraction(e);
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (isScrubbing) handleWaveformInteraction(e);
    });
    document.addEventListener('mouseup', () => {
        isScrubbing = false;
    });
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

function restoreFromHistory(snapshot) {
    // Restore track states
    snapshot.tracks.forEach(savedTrack => {
        const track = state.tracks.find(t => t.id === savedTrack.id);
        if (track) {
            track.volume = savedTrack.volume;
            track.pan = savedTrack.pan;
            track.solo = savedTrack.solo;
            track.mute = savedTrack.mute;
            
            // Update audio nodes
            if (track.gainNode) track.gainNode.gain.value = track.volume / 100;
            if (track.panNode) track.panNode.pan.value = track.pan;
        }
    });

    // Restore master
    state.masterVolume = snapshot.masterVolume;
    state.masterMute = snapshot.masterMute;
    updateMasterGain();

    // Restore markers
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
            
               // Create audio nodes - ROTEAMENTO CORRETO PARA PAN
const source = audioContext.createMediaElementSource(audioElement);
const gainNode = audioContext.createGain();
const panNode = audioContext.createStereoPanner();
const analyserNode = audioContext.createAnalyser();

// Configure analyser
analyserNode.fftSize = 256;
analyserNode.smoothingTimeConstant = 0.8; // Mais suave

// ROTEAMENTO: source -> panNode -> gainNode -> analyser -> master
// Pan ANTES do gain garante funcionamento correto
source.connect(panNode);
panNode.connect(gainNode);
gainNode.connect(analyserNode);
analyserNode.connect(masterGainNode);

// Define channelCount explicitamente para stereo
source.channelCount = 2;
source.channelCountMode = 'explicit';
source.channelInterpretation = 'speakers';

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
                panNode: panNode,
                sourceNode: source,
                analyserNode: analyserNode,
                vuLevel: 0,
                vuPeak: 0,
                vuClip: false
            };

            // Set initial values
            gainNode.gain.value = newTrack.volume / 100;
            panNode.pan.value = newTrack.pan;

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

function handleVolumeChange(trackId, value) {
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
        track.volume = parseInt(value);
        track.gainNode.gain.setValueAtTime(track.volume / 100, audioContext.currentTime);
        saveToHistory();
        render();
    }
}

function handlePanChange(trackId, value) {
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
        const newPan = parseFloat(value);
        
        // Garante que o valor está entre -1 e 1
        track.pan = Math.max(-1, Math.min(1, newPan));
        
        // Aplicar pan IMEDIATAMENTE
        if (track.panNode) {
            try {
                track.panNode.pan.cancelScheduledValues(audioContext.currentTime);
                track.panNode.pan.setValueAtTime(track.pan, audioContext.currentTime);
                
                // Debug no console
                console.log(`🎚️ Pan ${track.name}: ${formatPan(track.pan)} (${track.pan.toFixed(3)})`);
            } catch (err) {
                console.error('Erro ao aplicar pan:', err);
            }
        }
        
        saveToHistory();
        render();
    }
}

function handleMasterVolumeChange(value) {
    state.masterVolume = parseInt(value);
    updateMasterGain();
    saveToHistory();
    render();
}

function toggleMasterMute() {
    state.masterMute = !state.masterMute;
    updateMasterGain();
    saveToHistory();
    render();
}

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
    render();
}

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

function loadProjectsFromLocalStorage() {
    try {
        const saved = localStorage.getItem('multitrack_projects');
        if (saved) {
            const projects = JSON.parse(saved);
            // Marca todos como vindo do localStorage
            projects.forEach(p => {
                if (!p.source) p.source = 'localStorage';
            });
            state.savedProjects = projects;
            return projects;
        }
    } catch (err) {
        console.error('Error loading projects:', err);
    }
    return [];
}

function saveProjectsToLocalStorage() {
    try {
        const dataString = JSON.stringify(state.savedProjects);
        
        // Verifica tamanho (localStorage tem limite de ~5-10MB)
        const sizeInMB = new Blob([dataString]).size / (1024 * 1024);
        
        if (sizeInMB > 5) {
            console.warn(`⚠️ Dados muito grandes (${sizeInMB.toFixed(2)}MB). Pode falhar.`);
        }
        
        localStorage.setItem('multitrack_projects', dataString);
        console.log(`✅ Projetos salvos no localStorage (${sizeInMB.toFixed(2)}MB)`);
    } catch (err) {
        console.error('❌ Erro ao salvar no localStorage:', err);
        
        // Lança o erro para ser tratado na função que chamou
        throw new Error('localStorage cheio ou indisponível');
    }
}

async function saveCurrentProject() {
    if (state.tracks.length === 0) {
        showAlert('Adicione tracks antes de salvar o projeto');
        return;
    }

    const projectName = await showPrompt(
        'Nome do projeto:', 
        state.currentProject?.name || `Projeto ${state.savedProjects.length + 1}`
    );
    if (!projectName) return;

    showLoadingOverlay();
    updateLoadingProgress(1, 1, 'Salvando projeto...');

    const tracksData = state.tracks.map(t => ({
        id: t.id,
        name: t.name,
        volume: t.volume,
        pan: t.pan,
        solo: t.solo,
        mute: t.mute,
        color: t.color,
        audioData: t.audioData
    }));

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
        updatedAt: new Date().toLocaleString('pt-BR')
    };

    // MODO DESKTOP - Salva em pasta
    if (supportsFileSystem && projectsLibraryHandle) {
        try {
            const folderName = projectName.replace(/[<>:"/\\|?*]/g, '_');
            const projectFolder = await projectsLibraryHandle.getDirectoryHandle(
                folderName,
                { create: true }
            );

            const fileHandle = await projectFolder.getFileHandle('projeto.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(projectData, null, 2));
            await writable.close();

            projectData.folderName = folderName;
            projectData.source = 'folder';
            
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
            
            // Tenta salvar no localStorage também (sem bloquear se falhar)
            try {
                saveProjectsToLocalStorage();
            } catch (lsErr) {
                console.warn('Aviso: Não foi possível salvar no localStorage:', lsErr);
            }
            
            hideLoadingOverlay();
            showAlert(`✅ Projeto salvo na pasta: ${projectsLibraryHandle.name}/${folderName}`);
            render();
            return;
        } catch (err) {
            console.error('Erro ao salvar na pasta:', err);
            hideLoadingOverlay();
            
            // Oferece exportar como alternativa
            const shouldExport = await showConfirm(
                '❌ Erro ao salvar na pasta.\n\nDeseja exportar o projeto como arquivo .mtp?'
            );
            
            if (shouldExport) {
                exportProjectAsFile(projectData);
            }
            return;
        }
    }

    // MODO MOBILE/FALLBACK - Tenta salvar no localStorage
    projectData.source = 'localStorage';
    
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
    
    // Tenta salvar no localStorage
    try {
        saveProjectsToLocalStorage();
        hideLoadingOverlay();
        
        // Pergunta se quer baixar arquivo .mtp também
        const shouldDownload = await showConfirm(
            '✅ Projeto salvo no navegador!\n\nDeseja baixar uma cópia (.mtp) como backup?'
        );
        
        if (shouldDownload) {
            exportProjectAsFile(projectData);
        }
        
        render();
    } catch (lsErr) {
        console.error('Erro no localStorage:', lsErr);
        hideLoadingOverlay();
        
        // Se falhou, oferece exportar
        const shouldExport = await showConfirm(
            '⚠️ Erro ao salvar no navegador (projeto muito grande).\n\nDeseja exportar como arquivo .mtp?'
        );
        
        if (shouldExport) {
            exportProjectAsFile(projectData);
        } else {
            showAlert('❌ Projeto não foi salvo! Recomendamos exportar para não perder o trabalho.');
        }
    }
}

// NOVA FUNÇÃO AUXILIAR - Adicione logo após saveCurrentProject
function exportProjectAsFile(projectData) {
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectData.name}.mtp`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert('📥 Projeto exportado como arquivo .mtp!');
}
async function loadProject(project) {
    if (!projectsLibraryHandle && project.folderName) {
        showAlert('Pasta de projetos não selecionada. Configure a biblioteca primeiro.');
        return;
    }

    showLoadingOverlay();
    
    try {
        let projectData = project;
        
        // Se o projeto veio da pasta, recarrega para ter dados atualizados
        if (project.folderName) {
            const projectFolder = await projectsLibraryHandle.getDirectoryHandle(project.folderName);
            const fileHandle = await projectFolder.getFileHandle('projeto.json');
            const file = await fileHandle.getFile();
            const text = await file.text();
            projectData = JSON.parse(text);
            projectData.folderName = project.folderName;
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

        const newTracks = [];
        
        for (let i = 0; i < projectData.tracks.length; i++) {
            const trackData = projectData.tracks[i];
            updateLoadingProgress(i + 1, projectData.tracks.length, trackData.name);

          try {
    const audioElement = await base64ToAudioElement(trackData.audioData);
   const source = audioContext.createMediaElementSource(audioElement);
const gainNode = audioContext.createGain();
const panNode = audioContext.createStereoPanner();
const analyserNode = audioContext.createAnalyser();

analyserNode.fftSize = 256;
analyserNode.smoothingTimeConstant = 0.8;

// ROTEAMENTO: source -> panNode -> gainNode -> analyser -> master
source.connect(panNode);
panNode.connect(gainNode);
gainNode.connect(analyserNode);
analyserNode.connect(masterGainNode);

// Força stereo
source.channelCount = 2;
source.channelCountMode = 'explicit';
source.channelInterpretation = 'speakers';
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
                    panNode: panNode,
                    sourceNode: source,
                    analyserNode: analyserNode,
                    vuLevel: 0,
                    vuPeak: 0,
                    vuClip: false
                };

                gainNode.gain.value = track.volume / 100;
                panNode.pan.value = track.pan;

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
            } catch (error) {
                console.error('Error loading track:', trackData.name, error);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        state.tracks = newTracks;
        state.currentTime = 0;
        state.isPlaying = false;
        state.activeTab = 'mixer';
        
        history = [];
        historyIndex = -1;
        saveToHistory();
        
        hideLoadingOverlay();
        render();
    } catch (err) {
        console.error('Erro ao carregar projeto:', err);
        hideLoadingOverlay();
        showAlert('Erro ao carregar projeto: ' + err.message);
    }
}

async function deleteProject(projectId, event) {
    event.stopPropagation();
    const confirmed = await showConfirm('Deseja realmente excluir este projeto?');
    if (confirmed) {
        state.savedProjects = state.savedProjects.filter(p => p.id !== projectId);
        saveProjectsToLocalStorage();
        if (state.currentProject?.id === projectId) {
            state.currentProject = null;
        }
        render();
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
        
        // Gera novo ID para evitar conflito
        projectData.id = Date.now();
        projectData.source = 'localStorage';
        projectData.createdAt = new Date().toLocaleString('pt-BR');
        projectData.updatedAt = new Date().toLocaleString('pt-BR');
        
        // Adiciona à biblioteca
        state.savedProjects.push(projectData);
        
        // Tenta salvar no localStorage
        try {
            saveProjectsToLocalStorage();
        } catch (lsErr) {
            console.warn('Não foi possível salvar no localStorage:', lsErr);
        }
        
        hideLoadingOverlay();
        
        // Muda para aba biblioteca
        state.activeTab = 'library';
        render();
        
        showAlert(`✅ Projeto "${projectData.name}" importado para a biblioteca!\n\nClique nele para carregar.`);
    } catch (err) {
        console.error('Error importing project:', err);
        hideLoadingOverlay();
        showAlert('❌ Erro ao importar projeto. Verifique se o arquivo .mtp é válido.');
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
                    <input type="text" class="modal-input" value="${defaultValue}" autofocus>
                </div>
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
                        ${state.currentProject ? `<div class="project-name">${state.currentProject.name}</div>` : ''}
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
                    <button class="import-btn save-btn" ${state.tracks.length === 0 ? 'disabled' : ''}>
                        <i data-lucide="save"></i>
                        <span>Salvar</span>
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
    <button class="import-btn import-project-btn">
        <i data-lucide="file-up"></i>
        <span>Carregar .mtp</span>
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
                                <button class="delete-btn" data-project-id="${project.id}">
                                    <i data-lucide="trash-2"></i>
                                </button>
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
                    <div class="settings-item">
                        <label class="settings-label">Pasta de Projetos</label>
                        <p class="settings-description">
                            Selecione uma pasta do seu computador onde os projetos serão salvos
                        </p>
                        <div class="library-path-display">
                            <i data-lucide="folder-open"></i>
                            <div class="library-path-text ${!state.libraryPath ? 'not-selected' : ''}">
                                ${state.libraryPath ? `<strong>${state.libraryPath}</strong>` : 'Nenhuma pasta selecionada'}
                            </div>
                        </div>
                        <button class="select-library-btn">
                            <i data-lucide="folder-plus"></i>
                            <span>${state.libraryPath ? 'Trocar Pasta' : 'Selecionar Pasta'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// DYNAMIC EVENT LISTENERS - PAN MELHORADO
// ========================================

function attachDynamicEventListeners() {
    // Faders (non-master)
  // Faders (non-master) - COM SUPORTE TOUCH
// Faders - OTIMIZADO PARA TABLET
// Faders - TOUCH ISOLADO
document.querySelectorAll('.fader-wrapper[data-track-id]').forEach(wrapper => {
    let isDragging = false;
    let startY = 0;
    let startValue = 0;
    const trackId = parseFloat(wrapper.dataset.trackId);
    
    const onMouseDown = (e) => {
        e.stopPropagation();
        isDragging = true;
        const track = state.tracks.find(t => t.id === trackId);
        startY = e.clientY;
        startValue = track ? track.volume : 75;
        wrapper.classList.add('dragging');
        e.preventDefault();
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const deltaY = startY - e.clientY;
        const sensitivity = 0.6; // Mais sensível
        const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
        handleVolumeChange(trackId, newValue);
        e.preventDefault();
    };
    
    const onMouseUp = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        wrapper.classList.remove('dragging');
    };
    
    const onTouchStart = (e) => {
        e.stopPropagation();
        isDragging = true;
        const track = state.tracks.find(t => t.id === trackId);
        const touch = e.touches[0];
        startY = touch.clientY;
        startValue = track ? track.volume : 75;
        wrapper.classList.add('dragging');
        e.preventDefault();
    };
    
    const onTouchMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const touch = e.touches[0];
        const deltaY = startY - touch.clientY;
        const sensitivity = 0.6; // Mais sensível para tablet
        const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
        handleVolumeChange(trackId, newValue);
        e.preventDefault();
    };
    
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        wrapper.classList.remove('dragging');
    };
    
    // Eventos LOCAIS
    wrapper.addEventListener('mousedown', onMouseDown);
    wrapper.addEventListener('mousemove', onMouseMove);
    wrapper.addEventListener('mouseup', onMouseUp);
    wrapper.addEventListener('mouseleave', onMouseUp);
    
    wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd);
    wrapper.addEventListener('touchcancel', onTouchEnd);
});

    // Pan knobs - MELHORADO
    // Pan knobs - COM SUPORTE TOUCH PARA TABLET
// Pan knobs - OTIMIZADO PARA TABLET
// Pan knobs - TOUCH ISOLADO
document.querySelectorAll('.pan-knob-container[data-track-id]').forEach(container => {
    let isDragging = false;
    let startY = 0;
    let startValue = 0;
    const trackId = parseFloat(container.dataset.trackId);
    
    // MOUSE
    const onMouseDown = (e) => {
        e.stopPropagation();
        isDragging = true;
        const track = state.tracks.find(t => t.id === trackId);
        startY = e.clientY;
        startValue = track ? track.pan : 0;
        container.classList.add('dragging');
        e.preventDefault();
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const deltaY = startY - e.clientY;
        const sensitivity = 0.004;
        let newValue = startValue + deltaY * sensitivity;
        
        if (Math.abs(newValue) < 0.08) newValue = 0;
        newValue = Math.max(-1, Math.min(1, newValue));
        
        handlePanChange(trackId, newValue);
        e.preventDefault();
    };
    
    const onMouseUp = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        container.classList.remove('dragging');
    };
    
    // TOUCH - ISOLADO POR ELEMENTO
    const onTouchStart = (e) => {
        e.stopPropagation();
        isDragging = true;
        const track = state.tracks.find(t => t.id === trackId);
        const touch = e.touches[0];
        startY = touch.clientY;
        startValue = track ? track.pan : 0;
        container.classList.add('dragging');
        e.preventDefault();
    };
    
    const onTouchMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const touch = e.touches[0];
        const deltaY = startY - touch.clientY;
        const sensitivity = 0.006; // Mais sensível para tablet
        let newValue = startValue + deltaY * sensitivity;
        
        if (Math.abs(newValue) < 0.08) newValue = 0;
        newValue = Math.max(-1, Math.min(1, newValue));
        
        handlePanChange(trackId, newValue);
        e.preventDefault();
    };
    
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        container.classList.remove('dragging');
    };
    
    // Eventos LOCAIS (não document)
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);
});

    // Master fader
    // Master fader - COM SUPORTE TOUCH
// Master fader - TOUCH ISOLADO
const masterWrapper = document.querySelector('.master-fader-wrapper');
if (masterWrapper) {
    let isDragging = false;
    let startY = 0;
    let startValue = 0;
    
    const onMouseDown = (e) => {
        e.stopPropagation();
        isDragging = true;
        startY = e.clientY;
        startValue = state.masterVolume;
        masterWrapper.classList.add('dragging');
        e.preventDefault();
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const deltaY = startY - e.clientY;
        const sensitivity = 0.6;
        const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
        handleMasterVolumeChange(newValue);
        e.preventDefault();
    };
    
    const onMouseUp = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        masterWrapper.classList.remove('dragging');
    };
    
    const onTouchStart = (e) => {
        e.stopPropagation();
        isDragging = true;
        const touch = e.touches[0];
        startY = touch.clientY;
        startValue = state.masterVolume;
        masterWrapper.classList.add('dragging');
        e.preventDefault();
    };
    
    const onTouchMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        const touch = e.touches[0];
        const deltaY = startY - touch.clientY;
        const sensitivity = 0.6;
        const newValue = Math.max(0, Math.min(100, startValue + deltaY * sensitivity));
        handleMasterVolumeChange(newValue);
        e.preventDefault();
    };
    
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        e.stopPropagation();
        isDragging = false;
        masterWrapper.classList.remove('dragging');
    };
    
    // Eventos LOCAIS
    masterWrapper.addEventListener('mousedown', onMouseDown);
    masterWrapper.addEventListener('mousemove', onMouseMove);
    masterWrapper.addEventListener('mouseup', onMouseUp);
    masterWrapper.addEventListener('mouseleave', onMouseUp);
    
    masterWrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    masterWrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    masterWrapper.addEventListener('touchend', onTouchEnd);
    masterWrapper.addEventListener('touchcancel', onTouchEnd);
}

    // Track buttons
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

    // Markers
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

    // Projects
    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn')) {
                const projectId = parseInt(card.dataset.projectId);
                const project = state.savedProjects.find(p => p.id === projectId);
                if (project) {
                    loadProject(project);
                }
            }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const projectId = parseInt(button.dataset.projectId);
            deleteProject(projectId, e);
        });
    });
}