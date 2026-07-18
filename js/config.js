/* =====================================================================
   LUU TRAVELS & LOGISTICS - GLOBAL CONFIGURATION
   ===================================================================== */

var SUPABASE_URL = 'https://gwzpzvwermsfnputttdo.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3enB6dndlcm1zZm5wdXR0dGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzkxODYsImV4cCI6MjA5Nzk1NTE4Nn0.y4v8P0TxS4yfjj9DfWF_l1B8OBSl_ybv4vZBuVUN7Oc';

// Single shared Supabase client
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App-wide constants
var APP_CONFIG = {
    companyName: 'Luu Travels & Logistics',
    tagline: 'Moving People. Delivering Trust.',
    phone: '076 845 7061',
    whatsappNumber: '27768457061',
    email: 'LuuTravels611@gmail.com',
    address: 'Windmill Park Ext 32, Boksburg, Gauteng, South Africa',
    pricePerKm: 2.20,
    maxSeats: 9,
    routes: ['Gauteng-Limpopo', 'Limpopo-Gauteng'],
    currency: 'R',
    paystackPublicKey: 'pk_test_d2da5d0e56a7fa1e7c308f9d2e8bff76b970e4d7',
    paystackSecretKey: 'sk_test_72c3b06c8ef3be59dbcc18d74bdc1479642fba39'
};

function pathPrefix() {
    return window.location.pathname.includes('/pages/') ? '' : 'pages/';
}

function formatCurrency(amount) {
    var value = Number(amount || 0);
    return 'R' + value.toFixed(2);
}

function formatCurrencyForPaystack(amount) {
    return Math.round(amount * 100);
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    var toRad = function(deg) { return (deg * Math.PI) / 180; };
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, 4000);
}
