let templates = document.getElementById('template');
let announcement = document.getElementById('announcement');

new Sortable(templates, {
    group: {
        name: 'announcements',
        pull: 'clone',
        put: false
    },
    sort: false,
    animation: 150
});

// Announcements: accepts templates and allows reordering
new Sortable(announcement, {
    group: {
        name: 'announcements',
        pull: false,
        put: true
    },
    animation: 150,
    filter: 'select, option',
    preventOnFilter: false
});

announcement.addEventListener('click', (e) => {
    if (e.target.closest('select')) return;

    const item = e.target.closest('span');

    if (!item || !announcement.contains(item)) return;

    item.remove();
});

let playButton = document.getElementById("play");

async function playAudio(id) {
    const response = await fetch(`/audios/${encodeURIComponent(id)}.ogg`);

    if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${id}`);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);

    try {
        await audio.play();

        await new Promise((resolve, reject) => {
            audio.addEventListener('ended', resolve, { once: true });
            audio.addEventListener('error', reject, { once: true });
        });
    } finally {
        audio.pause();
        URL.revokeObjectURL(audioUrl);
    }
}


playButton.addEventListener('click', async () => {
    const items = [...announcement.children];

    playButton.disabled = true;
    playButton.textContent = 'Playing...';

    try {
        if (document.getElementById('chime').checked) {
            await playAudio('chime');
        }

        for (const item of items) {
            // Get the ID from the selected option, if one exists.
            const select = item.querySelector('select');
            const id = select ? select.value : item.dataset.id;

            if (!id) continue;

            try {
                await playAudio(id.replaceAll("-","_"));
            } catch (error) {
                console.error(`Error playing ${id}:`, error);
            }
        }
    } catch (error) {
        console.error('Playback error:', error);
    } finally {
        playButton.disabled = false;
        playButton.textContent = 'Play';
    }
});

async function generateAnnouncementAudio() {
    const items = [...announcement.children];
    const ids = [];

    if (document.getElementById('chime').checked) ids.push('chime');

    for (const item of items) {
        const select = item.querySelector('select');
        const id = select ? select.value : item.dataset.id;

        if (id) ids.push(id);
    }

    if (!ids.length) return alert('Por favor adicione pelo menos um anúncio.');

    const audioContext = new AudioContext();
    const buffers = [];

    // Fetch and decode all audio files
    for (const id of ids) {
        const response = await fetch(
            `/audios/${encodeURIComponent(id).replaceAll("-", "_")}.ogg`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch ${id}`);
        }

        const data = await response.arrayBuffer();

        const audioBuffer = await audioContext.decodeAudioData(data);

        buffers.push(audioBuffer);
    }

    // Calculate total duration
    const sampleRate = audioContext.sampleRate;

    const totalLength = buffers.reduce(
        (total, buffer) => total + Math.ceil(buffer.duration * sampleRate),
        0
    );

    // Create combined buffer
    const combined = audioContext.createBuffer(
        2,
        totalLength,
        sampleRate
    );

    let offset = 0;

    // Combine audio sequentially
    for (const buffer of buffers) {
        const length = Math.ceil(buffer.duration * sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const sourceChannel = Math.min(
                channel,
                buffer.numberOfChannels - 1
            );

            combined.getChannelData(channel).set(
                buffer.getChannelData(sourceChannel),
                offset
            );
        }

        offset += length;
    }

    // Convert to WAV
    const wav = audioBufferToWav(combined);

    // Download
    const url = URL.createObjectURL(
        new Blob([wav], { type: 'audio/wav' })
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = 'ml-announcement-' + Date.now() + '.wav';
    link.click();

    URL.revokeObjectURL(url);

    await audioContext.close();
}

function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;

    const dataSize = samples * channels * 2;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;

    for (let i = 0; i < samples; i++) {
        for (let channel = 0; channel < channels; channel++) {
            const sample = Math.max(
                -1,
                Math.min(1, buffer.getChannelData(channel)[i])
            );

            view.setInt16(
                offset,
                sample < 0 ? sample * 32768 : sample * 32767,
                true
            );

            offset += 2;
        }
    }

    return arrayBuffer;
}

document.querySelector('#download')
    .addEventListener('click', async () => {
        try {
            await generateAnnouncementAudio();
        } catch (error) {
            console.error(error);
            alert('Failed to generate audio.');
        }
    });