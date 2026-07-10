/* =====================================================================
   LUU TRAVELS & LOGISTICS - LANDING PAGE FUNCTIONALITY
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('open');
        });
        mobileMenu.querySelectorAll('a, .btn').forEach(el => {
            el.addEventListener('click', () => mobileMenu.classList.remove('open'));
        });
    }

    loadActiveAds();
    loadApprovedReviews();
    redirectIfLoggedIn();
});

// Replace the static testimonials with real, admin-approved customer reviews.
// If there aren't any yet, the static markup already in the HTML stays as-is.
async function loadApprovedReviews() {
    try {
        const { data, error } = await supabaseClient
            .from('reviews')
            .select('*, users(full_name)')
            .eq('is_approved', true)
            .order('created_at', { ascending: false })
            .limit(6);

        if (error || !data || data.length === 0) return;

        const grid = document.querySelector('.testimonial-grid');
        grid.innerHTML = data.map(r => {
            const name = r.users ? r.users.full_name : 'Luu Travels Customer';
            const initial = name.charAt(0).toUpperCase();
            return `
                <div class="testimonial-card">
                    <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                    <p>"${r.comment ? r.comment.replace(/</g, '&lt;') : 'Great experience with Luu Travels & Logistics.'}"</p>
                    <div class="testimonial-author"><div class="avatar">${initial}</div> ${name}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Could not load reviews:', err);
    }
}

// Show active ads (admins can post these anywhere; landing page shows them near the top)
async function loadActiveAds() {
    try {
        const { data, error } = await supabaseClient
            .from('ads')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) return;

        const section = document.getElementById('ads-section');
        const banner = document.getElementById('adsBanner');
        banner.innerHTML = data.map(ad => `
            <div class="ad-card">
                ${ad.image_url ? `<img src="${ad.image_url}" alt="${ad.title}">` : ''}
                <div>
                    <h4>${ad.title}</h4>
                    <p>${ad.content}</p>
                </div>
            </div>
        `).join('');
        section.style.display = 'block';
    } catch (err) {
        console.error('Could not load ads:', err);
    }
}

// If a logged-in user lands on index.html, don't force redirect (they may just be browsing),
// but if they click Login/Register while already authenticated, send them straight in.
async function redirectIfLoggedIn() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const loginBtns = document.querySelectorAll('a[href="pages/login.html"]');
        const registerBtns = document.querySelectorAll('a[href="pages/register.html"]');
        loginBtns.forEach(btn => { btn.href = 'pages/dashboard.html'; btn.textContent = 'Dashboard'; });
        registerBtns.forEach(btn => { btn.href = 'pages/booking.html'; btn.textContent = 'Book a Trip'; });
    } catch (err) {
        // Not logged in or session check failed - no action needed
    }
}
