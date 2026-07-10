/* =====================================================================
   LUU TRAVELS & LOGISTICS - PROFILE MANAGER
   ===================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AuthManager.requireAuth('login.html');
    if (!user) return;

    const profile = await AuthManager.getProfile(user.id);
    renderProfile(profile, user);
    await loadBookingCount(user.id);
    setupMobileMenu();

    // Logout handlers
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await AuthManager.logout();
        window.location.href = '../index.html';
    });

    document.getElementById('mobileLogout').addEventListener('click', async (e) => {
        e.preventDefault();
        await AuthManager.logout();
        window.location.href = '../index.html';
    });
});

function setupMobileMenu() {
    const hamburger = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('open');
        });

        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                mobileMenu.classList.remove('open');
            });
        });
    }
}

function renderProfile(profile, user) {
    const initial = profile.full_name.charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = initial;
    document.getElementById('profileName').textContent = profile.full_name;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profilePhone').textContent = profile.phone || 'Not provided';
    document.getElementById('profileSince').textContent = new Date(profile.created_at).toLocaleDateString('en-ZA', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

async function loadBookingCount(userId) {
    const { count, error } = await supabaseClient
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (!error) {
        document.getElementById('totalBookings').textContent = count || 0;
    }
}
