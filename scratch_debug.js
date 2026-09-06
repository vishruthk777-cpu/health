const fs = require('fs');
const path = require('path');

// Mock browser globals
global.window = {
    location: { hash: '' },
    addEventListener: (event, cb) => {
        console.log(`[window] addEventListener registered: ${event}`);
    }
};

const elements = {};
const listeners = {};

class MockElement {
    constructor(id, tagName = 'div') {
        this.id = id;
        this.tagName = tagName;
        this.classList = {
            add: (c) => console.log(`[DOM] Element #${id} classList.add('${c}')`),
            remove: (c) => console.log(`[DOM] Element #${id} classList.remove('${c}')`),
            contains: () => false
        };
        this.style = {};
        this.innerHTML = '';
        this.textContent = '';
        this.parentElement = {
            clientWidth: 800,
            clientHeight: 600
        };
    }

    addEventListener(event, cb) {
        console.log(`[DOM] Element #${this.id || 'unknown'} addEventListener registered: ${event}`);
        if (!listeners[this.id]) listeners[this.id] = {};
        listeners[this.id][event] = cb;
    }

    appendChild(child) {
        console.log(`[DOM] Element #${this.id} appendChild`);
    }

    querySelector(selector) {
        return new MockElement(null);
    }
    
    querySelectorAll(selector) {
        return [];
    }

    getContext(type) {
        return {
            clearRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            arc: () => {},
            fill: () => {}
        };
    }

    setAttribute(name, val) {
        // console.log(`[DOM] Element #${this.id} setAttribute('${name}', '${val}')`);
    }
}

global.document = {
    addEventListener: (event, cb) => {
        console.log(`[document] addEventListener registered: ${event}`);
        if (event === 'DOMContentLoaded') {
            global.domContentLoadedHandler = cb;
        }
    },
    getElementById: (id) => {
        if (!elements[id]) {
            elements[id] = new MockElement(id);
        }
        return elements[id];
    },
    querySelector: (selector) => {
        console.log(`[document] querySelector: ${selector}`);
        return new MockElement(selector);
    },
    querySelectorAll: (selector) => {
        console.log(`[document] querySelectorAll: ${selector}`);
        if (selector === '.db-twin-node' || selector === '.pipeline-node') {
            return [new MockElement('node1'), new MockElement('node2')];
        }
        return [];
    },
    createElementNS: (ns, tagName) => {
        return new MockElement(tagName);
    },
    createElement: (tagName) => {
        return new MockElement('', tagName);
    },
    body: new MockElement('body')
};

global.lucide = {
    createIcons: () => {
        console.log('[Lucide] createIcons() called');
    }
};

global.requestAnimationFrame = (cb) => {
    console.log('[window] requestAnimationFrame registered');
};

global.setInterval = (cb, time) => {
    console.log(`[Timer] setInterval registered with delay ${time}ms`);
    return 99; // Mock interval ID
};

global.setTimeout = (cb, time) => {
    console.log(`[Timer] setTimeout registered with delay ${time}ms`);
    return 100;
};

// Load personnel_wellness_api.js first
const apiPath = path.join(__dirname, 'js', 'personnel_wellness_api.js');
console.log(`Reading js/personnel_wellness_api.js from: ${apiPath}`);
let apiCode = fs.readFileSync(apiPath, 'utf8');
eval(apiCode);

// Load the dashboard.js file content
const jsPath = path.join(__dirname, 'js', 'dashboard.js');
console.log(`Reading js/dashboard.js from: ${jsPath}`);
let code = fs.readFileSync(jsPath, 'utf8');

// Modify the code to expose variables and functions
code = code.replace('const LifeOS =', 'global.LifeOS =');
code = code.replace('function launchDashboardShell()', 'global.launchDashboardShell = function launchDashboardShell()');
code = code.replace('function switchRole(role)', 'global.switchRole = function switchRole(role)');
code = code.replace('function renderActiveView()', 'global.renderActiveView = function renderActiveView()');
code = code.replace('function recalculateHealthScores()', 'global.recalculateHealthScores = function recalculateHealthScores()');

// Execute the code
console.log('Evaluating modified js/dashboard.js in node context...');
try {
    eval(code);
    if (global.domContentLoadedHandler) {
        global.domContentLoadedHandler();
    }
    
    if (global.launchDashboardShell) {
        console.log('--- LAUNCHING SHELL ---');
        global.launchDashboardShell();
    }

    // Now loop over every role and every tab and render it!
    const Portals = {
        patient: ['twin', 'personnel_wellness', 'coach', 'genomics', 'intelligence', 'nutrition', 'exercise', 'care', 'longevity', 'medication', 'simulator', 'consultation', 'search', 'copilot', 'automation'],
        welfare_officer: ['personnel_wellness', 'audit_ledger'],
        doctor: ['patients', 'consultations', 'prescribe'],
        researcher: ['datasets', 'trials', 'publications'],
        provider: ['analytics', 'staff', 'workflows'],
        investor: ['vision', 'tam'],
        admin: ['personnel_wellness', 'users', 'agents', 'audit', 'security']
    };

    for (const role of Object.keys(Portals)) {
        console.log(`\n======================= SWITCHING TO ROLE: ${role.toUpperCase()} =======================`);
        global.switchRole(role);
        
        for (const tab of Portals[role]) {
            console.log(`\n--- RENDERING TAB: ${tab.toUpperCase()} ---`);
            global.LifeOS.activeTab = tab;
            global.renderActiveView();
            console.log(`--- TAB ${tab.toUpperCase()} RENDERED SUCCESSFULLY ---`);
        }
    }
    
    console.log('\n=============================================');
    console.log('All roles and tabs rendered successfully without any hangs!');
    console.log('=============================================');
} catch (err) {
    console.error('Error during execution:', err);
}
