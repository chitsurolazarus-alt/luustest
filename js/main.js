/* =====================================================================
   LUU TRAVELS & LOGISTICS - LANDING PAGE FUNCTIONALITY
   ===================================================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    var hamburgerBtn = document.getElementById('hamburgerBtn');
    var mobileMenu = document.getElementById('mobileMenu');
    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('open');
        });
        var links = mobileMenu.querySelectorAll('a, .btn');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                mobileMenu.classList.remove('open');
            });
        }
    }

    loadActiveAds();
    loadApprovedReviews();
    redirectIfLoggedIn();
});

// Replace the static testimonials with real, admin-approved customer reviews.
async function loadApprovedReviews() {
    try {
        var { data, error } = await supabaseClient
            .from('reviews')
            .select('*, users(full_name)')
            .eq('is_approved', true)
            .order('created_at', { ascending: false })
            .limit(6);

        if (error || !data || data.length === 0) return;

        var grid = document.querySelector('.testimonial-grid');
        var html = '';
        
        for (var i = 0; i < data.length; i++) {
            var r = data[i];
            var name = r.reviewer_name || (r.users ? r.users.full_name : 'Luu Travels Customer');
            var initial = name.charAt(0).toUpperCase();
            var commentText = r.comment ? r.comment.replace(/</g, '&lt;') : 'Great experience with Luu Travels & Logistics.';
            
            html += '<div class="testimonial-card">';
            html += '<div class="stars">' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + '</div>';
            html += '<p>"' + commentText + '"</p>';
            html += '<div class="testimonial-author"><div class="avatar">' + initial + '</div> ' + name + '</div>';
            html += '</div>';
        }
        
        grid.innerHTML = html;
    } catch (err) {
        console.error('Could not load reviews:', err);
    }
}

// Show active ads (admins can post these anywhere; landing page shows them near the top)
async function loadActiveAds() {
    try {
        var { data, error } = await supabaseClient
            .from('ads')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) return;

        var section = document.getElementById('ads-section');
        var banner = document.getElementById('adsBanner');
        var html = '';
        
        for (var i = 0; i < data.length; i++) {
            var ad = data[i];
            html += '<div class="ad-card">';
            if (ad.image_url) {
                html += '<img src="' + ad.image_url + '" alt="' + ad.title + '">';
            }
            html += '<div><h4>' + ad.title + '</h4><p>' + ad.content + '</p></div>';
            html += '</div>';
        }
        
        banner.innerHTML = html;
        section.style.display = 'block';
    } catch (err) {
        console.error('Could not load ads:', err);
    }
}

// If a logged-in user lands on index.html, don't force redirect (they may just be browsing),
// but if they click Login/Register while already authenticated, send them straight in.
async function redirectIfLoggedIn() {
    try {
        var { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        var loginBtns = document.querySelectorAll('a[href="pages/login.html"]');
        var registerBtns = document.querySelectorAll('a[href="pages/register.html"]');
        for (var i = 0; i < loginBtns.length; i++) {
            loginBtns[i].href = 'pages/dashboard.html';
            loginBtns[i].textContent = 'Dashboard';
        }
        for (var j = 0; j < registerBtns.length; j++) {
            registerBtns[j].href = 'pages/booking.html';
            registerBtns[j].textContent = 'Book a Trip';
        }
    } catch (err) {
        // Not logged in or session check failed - no action needed
    }
}
