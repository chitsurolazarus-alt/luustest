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

// Load active ads with larger display
async function loadActiveAds() {
    try {
        var { data, error } = await supabaseClient
            .from('ads')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) {
            // Show default ads if none in database
            showDefaultAds();
            return;
        }

        var banner = document.getElementById('adsBanner');
        if (!banner) return;
        
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var ad = data[i];
            var borderColor = i % 2 === 0 ? 'var(--accent)' : 'var(--success)';
            html += '<div class="ad-card-large" style="background:var(--secondary); border-radius:var(--radius); box-shadow:var(--shadow); padding:30px; margin-bottom:20px; border-left:6px solid ' + borderColor + ';">';
            html += '<div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">';
            if (ad.image_url) {
                html += '<img src="' + ad.image_url + '" alt="' + ad.title + '" style="width:120px; height:120px; object-fit:cover; border-radius:12px; flex-shrink:0;">';
            }
            html += '<div style="flex:1;">';
            html += '<h4 style="font-size:1.3rem; color:var(--primary); margin-bottom:8px;">' + ad.title + '</h4>';
            html += '<p style="color:var(--gray-600); font-size:1.05rem; line-height:1.6;">' + ad.content + '</p>';
            html += '</div></div></div>';
        }
        
        banner.innerHTML = html;
        document.getElementById('ads-section').style.display = 'block';
    } catch (err) {
        console.error('Could not load ads:', err);
        showDefaultAds();
    }
}

function showDefaultAds() {
    var banner = document.getElementById('adsBanner');
    if (!banner) return;
    
    banner.innerHTML = `
        <div class="ad-card-large" style="background:var(--secondary); border-radius:var(--radius); box-shadow:var(--shadow); padding:30px; margin-bottom:20px; border-left:6px solid var(--accent);">
            <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1;">
                    <h4 style="font-size:1.3rem; color:var(--primary); margin-bottom:8px;">🚐 Welcome to Luu Travels!</h4>
                    <p style="color:var(--gray-600); font-size:1.05rem; line-height:1.6;">Safe and reliable shuttle transport between Gauteng and Limpopo. Book your trip today!</p>
                </div>
            </div>
        </div>
        <div class="ad-card-large" style="background:var(--secondary); border-radius:var(--radius); box-shadow:var(--shadow); padding:30px; margin-bottom:20px; border-left:6px solid var(--success);">
            <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1;">
                    <h4 style="font-size:1.3rem; color:var(--primary); margin-bottom:8px;">🎉 Special Offer</h4>
                    <p style="color:var(--gray-600); font-size:1.05rem; line-height:1.6;">Book your trip now and get 10% off with code <strong style="color:var(--accent-dark);">WELCOME10</strong></p>
                </div>
            </div>
        </div>
    `;
    document.getElementById('ads-section').style.display = 'block';
}

// Load approved reviews with full customer names
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

// If a logged-in user lands on index.html
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
