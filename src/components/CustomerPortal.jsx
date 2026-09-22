import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const CustomerPortal = () => {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const restaurantId = searchParams.get('res_id') || 'D360-KAT-8315';
  const tableId = searchParams.get('table_id');

  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'booking'
  const [activeCategory, setActiveCategory] = useState('all');
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [tableName, setTableName] = useState('Table QR');
  
  // Tables list for booking dropdown
  const [tablesList, setTablesList] = useState([]);
  const [selectedTableToBook, setSelectedTableToBook] = useState('');

  // Booking Form State
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState('4');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('21:00');
  const [slotStatusMsg, setSlotStatusMsg] = useState('');

  useEffect(() => {
    if (tableId) fetchTableDetails();
    fetchMenuItems();
    fetchAvailableTables();
    const today = new Date().toISOString().split('T')[0];
    setBookingDate(today);
  }, [tableId]);

  const fetchTableDetails = async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('table_name')
      .eq('id', tableId)
      .single();
    if (data) setTableName(data.table_name);
  };

  const fetchAvailableTables = async () => {
    const { data } = await supabase.from('restaurant_tables').select('*');
    if (data && data.length > 0) {
      setTablesList(data);
      setSelectedTableToBook(data[0].id);
    } else {
      setTablesList([
        { id: 1, table_name: 'Table 01' },
        { id: 2, table_name: 'Table 02' }
      ]);
      setSelectedTableToBook(1);
    }
  };

  const fetchMenuItems = async () => {
    const { data } = await supabase.from('inventory_items').select('*');
    if (data && data.length > 0) {
      setMenuItems(data.map(i => ({
        id: i.item_id || i.id,
        name: i.name,
        price: i.price,
        category: (i.category || 'starters').toLowerCase(),
        desc: i.desc || 'Authentic traditional recipe prepared with care.',
        img: i.img || 'https://placehold.co/400x300/efece6/8c6d36?text=Royal+Dish'
      })));
    } else {
      setMenuItems([
        { id: 1, name: "Hyderabadi Chicken Dum Biryani", category: "biryani", price: 320, desc: "Authentic long-grain basmati rice cooked with tender chicken and aromatic spices.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Chicken+Biryani" },
        { id: 2, name: "Mutton Masala Biryani", category: "biryani", price: 450, desc: "Rich and flavorful basmati rice layered with juicy tender mutton pieces.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Mutton+Biryani" },
        { id: 3, name: "Chicken 65 Starter", category: "starters", price: 260, desc: "Crispy, deep-fried spicy chicken starter tossed with curry leaves.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Chicken+65" },
        { id: 4, name: "Paneer Tikka", category: "starters", price: 240, desc: "Marinated cottage cheese cubes grilled to smoky perfection in a clay oven.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Paneer+Tikka" },
        { id: 5, name: "Special Karam Dosa", category: "tiffins", price: 120, desc: "Crispy crepe smeared with spicy red chili paste and pure ghee.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Karam+Dosa" },
        { id: 6, name: "Gulab Jamun", category: "desserts", price: 90, desc: "Deep-fried milk solid dumplings soaked in warm sugar syrup.", img: "https://placehold.co/400x300/efece6/8c6d36?text=Gulab+Jamun" }
      ]);
    }
  };

  const addToCart = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: { ...item, qty: (prev[item.id]?.qty || 0) + 1 }
    }));
  };

  const changeQty = (id, delta) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[id]) {
        updated[id].qty += delta;
        if (updated[id].qty <= 0) delete updated[id];
      }
      return updated;
    });
  };

  const calculateTotal = () => {
    return Object.values(cart).reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const placeOrder = async () => {
    if (Object.keys(cart).length === 0) return;
    const itemsArray = Object.values(cart);
    const total = calculateTotal();

    // Determine order type based on whether a QR table_id exists in URL
    const orderTypeVal = tableId ? 'Dine-In' : 'Takeaway';

    const { error } = await supabase.from('restaurant_orders').insert([{
      restaurant_id: restaurantId,
      table_id: tableId || null,
      table_name: tableName,
      order_type: orderTypeVal,
      items: itemsArray,
      total_amount: total,
      status: 'Pending'
    }]);

    if (error) {
      alert('Error placing order: ' + error.message);
    } else {
      alert(`Order Placed Successfully as ${orderTypeVal}! Sent to Kitchen KOT.`);
      setCart({});
      setIsCartOpen(false);
    }
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    setSlotStatusMsg('Checking slot availability...');

    const { data: existingBookings } = await supabase
      .from('table_reservations')
      .select('*')
      .eq('table_id', selectedTableToBook)
      .eq('booking_date', bookingDate)
      .eq('status', 'Confirmed');

    if (existingBookings && existingBookings.length > 0) {
      const isConflict = existingBookings.some(b => 
        (startTime >= b.start_time && startTime < b.end_time)
      );
      if (isConflict) {
        alert('Selected time slot is already booked for this table! Please choose another time.');
        setSlotStatusMsg('Slot Busy');
        return;
      }
    }

    const { error } = await supabase.from('table_reservations').insert([{
      restaurant_id: restaurantId,
      table_id: selectedTableToBook,
      customer_name: customerName,
      phone,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      status: 'Confirmed'
    }]);

    if (error) {
      alert('Booking Failed: ' + error.message);
      setSlotStatusMsg('');
    } else {
      alert('Table Booked Successfully! Slot Confirmed.');
      setSlotStatusMsg('Confirmed Successfully');
      setCustomerName('');
      setPhone('');
    }
  };

  const filteredMenu = activeCategory === 'all' 
    ? menuItems 
    : menuItems.filter(i => i.category === activeCategory);

  const totalCartCount = Object.values(cart).reduce((a, c) => a + c.qty, 0);

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#2A2521] font-sans selection:bg-[#9c7430] selection:text-white pb-24">
      {/* Navigation Bar */}
      <nav className="bg-[#F7F4EE]/95 backdrop-blur-md border-b border-[#E6E1D6] fixed w-full z-50 top-0">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-[#8c6d36] text-white p-2.5 rounded-xl shadow-sm">
                <i className="fa-solid fa-utensils text-lg"></i>
              </div>
              <div>
                <span className="text-2xl font-bold tracking-tight font-serif text-[#2A2521]">Royal Spice</span>
                <p className="text-xs text-[#8c6d36] font-medium">📍 {tableName}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex bg-[#EFECE6] rounded-full p-1 border border-[#D9D3C5]">
                <button 
                  onClick={() => setActiveTab('menu')} 
                  className={`px-5 py-2 rounded-full text-xs font-semibold transition ${activeTab === 'menu' ? 'bg-[#2A2521] text-[#F7F4EE] shadow-sm' : 'text-[#5C534A]'}`}
                >
                  Menu
                </button>
                <button 
                  onClick={() => setActiveTab('booking')} 
                  className={`px-5 py-2 rounded-full text-xs font-semibold transition ${activeTab === 'booking' ? 'bg-[#2A2521] text-[#F7F4EE] shadow-sm' : 'text-[#5C534A]'}`}
                >
                  Table Booking
                </button>
              </div>

              <button onClick={() => setIsCartOpen(true)} className="relative bg-[#EFECE6] text-[#2A2521] hover:bg-[#E2DDD3] p-3 rounded-full transition border border-[#D9D3C5]">
                <i className="fa-solid fa-cart-shopping"></i>
                <span className="absolute -top-1 -right-1 bg-[#8c6d36] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{totalCartCount}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content View */}
      <div className="pt-28 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        {activeTab === 'menu' ? (
          <div>
            <div className="text-center mb-12">
              <span className="text-[#8c6d36] font-semibold text-xs tracking-widest uppercase">Gastronomic Selection</span>
              <h2 className="text-3xl sm:text-4xl font-bold font-serif text-[#2A2521] mt-1">Our Signature Menu</h2>
              
              {/* Category Tabs */}
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                {['all', 'starters', 'biryani', 'tiffins', 'desserts'].map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-6 py-2 rounded-full font-medium text-sm transition capitalize ${activeCategory === cat ? 'bg-[#2A2521] text-[#F7F4EE] shadow-sm' : 'bg-[#FAF8F5] text-[#5C534A] border border-[#D9D3C5] hover:bg-[#F2EEE4]'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredMenu.map(item => (
                <div key={item.id} className="bg-[#FAF8F5] rounded-2xl shadow-sm border border-[#E6E1D6] overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="relative h-48 overflow-hidden bg-[#EFECE6]">
                      <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                      <span className="absolute top-3 right-3 bg-[#FAF8F5]/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#8c6d36] shadow-sm font-serif border border-[#E6E1D6]">₹{item.price}</span>
                    </div>
                    <div className="p-6">
                      <h3 className="font-bold text-lg font-serif text-[#2A2521] mb-2">{item.name}</h3>
                      <p className="text-[#5C534A] text-xs font-light line-clamp-2 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                  <div className="p-6 pt-0">
                    {cart[item.id] ? (
                      <div className="flex items-center justify-between bg-[#EFECE6] p-2 rounded-xl border border-[#D9D3C5]">
                        <button onClick={() => changeQty(item.id, -1)} className="w-8 h-8 bg-white rounded-lg font-bold shadow-sm">-</button>
                        <span className="text-xs font-bold">{cart[item.id].qty} in cart</span>
                        <button onClick={() => changeQty(item.id, 1)} className="w-8 h-8 bg-white rounded-lg font-bold shadow-sm">+</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item)} className="w-full bg-[#EFECE6] hover:bg-[#8c6d36] hover:text-white text-[#2A2521] font-medium text-xs py-2.5 rounded-xl transition flex items-center justify-center space-x-2 border border-[#D9D3C5]">
                        <i className="fa-solid fa-plus text-[10px]"></i> <span>Add to Cart</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-12">
            <div className="bg-[#FAF8F5] rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 border border-[#E6E1D6]">
              <div className="md:col-span-5 bg-[#2A2521] p-8 text-[#F7F4EE] flex flex-col justify-between">
                <div>
                  <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-[#d4af37]">Reservation</span>
                  <h3 className="text-2xl font-bold font-serif mt-4 mb-2">Live Table Slot Availability</h3>
                  <p className="text-[#D3CBC0] text-sm font-light">Check real-time slot availability and reserve your table instantly.</p>
                </div>
                {slotStatusMsg && <div className="mt-4 p-2 bg-[#8c6d36]/20 border border-[#8c6d36] rounded text-xs text-amber-300">{slotStatusMsg}</div>}
              </div>

              <div className="md:col-span-7 p-8 sm:p-10">
                <form onSubmit={handleBooking} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C534A] mb-1">Full Name</label>
                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} required placeholder="Enter your name" className="w-full px-4 py-3 rounded-xl border border-[#D9D3C5] bg-[#F7F4EE] text-[#2A2521] text-sm" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C534A] mb-1">Phone Number</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="Mobile number" className="w-full px-4 py-3 rounded-xl border border-[#D9D3C5] bg-[#F7F4EE] text-[#2A2521] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C534A] mb-1">Select Table</label>
                      <select value={selectedTableToBook} onChange={e => setSelectedTableToBook(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[#D9D3C5] bg-[#F7F4EE] text-[#2A2521] text-sm">
                        <option value="1">Table 01 — 4 Seater (Family)</option>
                        <option value="2">Table 02 — 2 Seater (Couple / Cozy)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C534A] mb-1">Date</label>
                      <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-[#D9D3C5] bg-[#F7F4EE] text-[#2A2521] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C534A] mb-1">Time Slot</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-[#D9D3C5] bg-[#F7F4EE] text-[#2A2521] text-sm" />
                    </div>
                  </div>

                  <button type="submit" className="w-full bg-[#8c6d36] hover:bg-[#72572b] text-white font-medium py-3.5 rounded-xl transition text-sm">
                    Check & Confirm Slot
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cart Modal Slide-over */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-[#FAF8F5] w-full max-w-md h-full p-6 flex flex-col justify-between shadow-2xl border-l border-[#E6E1D6]">
            <div className="flex justify-between items-center pb-4 border-b border-[#E6E1D6]">
              <h3 className="text-lg font-bold font-serif text-[#2A2521]">Your Order Cart</h3>
              <button onClick={() => setIsCartOpen(false)} className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center font-bold">✕</button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 space-y-3">
              {Object.keys(cart).length === 0 ? (
                <p className="text-center text-[#8C8277] py-8 text-xs font-light">Your cart is empty.</p>
              ) : (
                Object.values(cart).map(item => (
                  <div key={item.id} className="flex justify-between items-center bg-[#EFECE6] p-3 rounded-xl border border-[#D9D3C5]">
                    <div>
                      <h4 className="font-semibold text-[#2A2521] text-xs font-serif">{item.name}</h4>
                      <span className="text-[11px] text-[#5C534A]">₹{item.price} x {item.qty}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => changeQty(item.id, -1)} className="w-6 h-6 bg-white rounded-full font-bold text-xs">-</button>
                      <span className="text-xs font-semibold">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} className="w-6 h-6 bg-white rounded-full font-bold text-xs">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-[#E6E1D6] mt-auto">
              <div className="flex justify-between font-bold text-base mb-4 font-serif">
                <span className="text-[#2A2521]">Total Amount:</span>
                <span className="text-[#8c6d36]">₹{calculateTotal()}</span>
              </div>
              <button onClick={placeOrder} className="w-full bg-[#2A2521] hover:bg-[#8c6d36] text-[#F7F4EE] font-medium py-3 rounded-xl transition text-sm">
                Place Order to Kitchen KOT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;