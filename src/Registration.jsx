export default function Registration({ onNavigate }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100 font-sans">
            <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
                        <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-[spin_3s_linear_infinite]"></div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dine360 POS</h1>
                </div>
                <p className="text-gray-500 font-medium">Create your restaurant workspace</p>
            </div>

            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800">Restaurant Details</h2>
                    <p className="text-sm text-gray-500 mt-1">Please provide your primary contact and location information.</p>
                </div>
                <form className="p-8 space-y-6" onSubmit={(e) => { e.preventDefault(); onNavigate('pos'); }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Owner Name</label>
                            <input type="text" placeholder="Full Name" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                            <input type="email" placeholder="owner@email.com" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                            <input type="tel" placeholder="+91 00000 00000" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Restaurant Name</label>
                            <input type="text" placeholder="e.g. Royal Spice" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">City</label>
                            <input type="text" placeholder="e.g. Hyderabad" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium" required />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Restaurant Address</label>
                            <textarea rows="3" placeholder="Complete street address" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium resize-none" required></textarea>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100">
                        <button type="submit" className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-lg">
                            Register Restaurant
                        </button>
                        <p className="text-center text-sm text-gray-500 mt-4 font-medium">
                            Already have a Dine360 account? <button type="button" onClick={() => onNavigate('pos')} className="text-emerald-600 hover:text-emerald-700 font-bold hover:underline">Log in here</button>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}