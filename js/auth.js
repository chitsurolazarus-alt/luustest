/* =====================================================================
   LUU TRAVELS & LOGISTICS - AUTHENTICATION MANAGER
   Requires config.js to be loaded first.
   ===================================================================== */

var AuthManager = {

    register: async function({ fullName, email, phone, password }) {
        var { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: { 
                data: { 
                    full_name: fullName, 
                    phone: phone 
                }
            }
        });
        if (error) throw error;
        return data;
    },

    login: async function({ email, password }) {
        var { data, error } = await supabaseClient.auth.signInWithPassword({ 
            email: email, 
            password: password 
        });
        if (error) throw error;

        var profile = await this.getProfile(data.user.id);
        return { session: data.session, user: data.user, profile: profile };
    },

    logout: async function() {
        try {
            var { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            localStorage.removeItem('sb-gwzpzvwermsfnputttdo-auth-token');
            return true;
        } catch (err) {
            console.error('Logout error:', err);
            throw err;
        }
    },

    getProfile: async function(userId) {
        var { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    getCurrentUser: async function() {
        var { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    requireAuth: async function(redirectTo) {
        redirectTo = redirectTo || 'login.html';
        var user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        return user;
    },

    requireAdmin: async function(redirectTo) {
        redirectTo = redirectTo || 'admin-login.html';
        var user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        var profile = await this.getProfile(user.id);
        if (profile.role !== 'admin') {
            window.location.href = redirectTo;
            return null;
        }
        return { user: user, profile: profile };
    },

    requireDriver: async function(redirectTo) {
        redirectTo = redirectTo || 'login.html';
        var user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        var profile = await this.getProfile(user.id);
        if (profile.role !== 'driver') {
            window.location.href = redirectTo;
            return null;
        }
        return { user: user, profile: profile };
    },

    sendPasswordReset: async function(email) {
        var redirectUrl = window.location.origin + pathPrefix() + 'reset-password.html';
        var { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });
        if (error) throw error;
    },

    updatePassword: async function(newPassword) {
        var { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
    }
};

function passwordStrength(password) {
    var score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { label: 'Weak', className: 'weak' };
    if (score <= 3) return { label: 'Medium', className: 'medium' };
    return { label: 'Strong', className: 'strong' };
}
