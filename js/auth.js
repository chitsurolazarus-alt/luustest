/* =====================================================================
   LUU TRAVELS & LOGISTICS - AUTHENTICATION MANAGER
   Requires config.js to be loaded first.
   ===================================================================== */

const AuthManager = {

    async register({ fullName, email, phone, password }) {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName, phone } }
        });
        if (error) throw error;
        return data;
    },

    async login({ email, password }) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const profile = await this.getProfile(data.user.id);
        return { session: data.session, user: data.user, profile };
    },

    async logout() {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            localStorage.removeItem('sb-gwzpzvwermsfnputttdo-auth-token');
            return true;
        } catch (err) {
            console.error('Logout error:', err);
            throw err;
        }
    },

    async getProfile(userId) {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async getCurrentUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    async requireAuth(redirectTo = 'login.html') {
        const user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        return user;
    },

    async requireAdmin(redirectTo = 'admin-login.html') {
        const user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        const profile = await this.getProfile(user.id);
        if (profile.role !== 'admin') {
            window.location.href = redirectTo;
            return null;
        }
        return { user, profile };
    },

    async requireDriver(redirectTo = 'login.html') {
        const user = await this.getCurrentUser();
        if (!user) {
            window.location.href = redirectTo;
            return null;
        }
        const profile = await this.getProfile(user.id);
        if (profile.role !== 'driver') {
            window.location.href = redirectTo;
            return null;
        }
        return { user, profile };
    },

    async sendPasswordReset(email) {
        const redirectUrl = window.location.origin + pathPrefix() + 'reset-password.html';
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });
        if (error) throw error;
    },

    async updatePassword(newPassword) {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
    }
};

function passwordStrength(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { label: 'Weak', className: 'weak' };
    if (score <= 3) return { label: 'Medium', className: 'medium' };
    return { label: 'Strong', className: 'strong' };
}
