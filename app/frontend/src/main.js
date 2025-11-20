import './style.css';
import { initApp } from './app.js';
import { Buffer } from 'buffer';
import process from 'process';

window.Buffer = Buffer;
window.process = process;

document.addEventListener('DOMContentLoaded', initApp);
