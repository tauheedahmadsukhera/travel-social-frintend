import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineGlobeAlt, HiOutlineTag } from 'react-icons/hi';

const Management = () => {
  const [categories, setCategories] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' or 'regions'

  // Form states
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [type, setType] = useState('country');
  const [code, setCode] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, regRes] = await Promise.all([
        adminAPI.getCategories(),
        adminAPI.getRegions()
      ]);
      if (catRes.success) setCategories(catRes.data);
      if (regRes.success) setRegions(regRes.data);
    } catch (err) {
      toast.error('Failed to load management data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    try {
      const res = await adminAPI.addCategory({ name, image });
      if (res.success) {
        toast.success('Category added');
        setName('');
        setImage('');
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to add category');
    }
  };

  const handleAddRegion = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    try {
      const res = await adminAPI.addRegion({ name, image, countryCode: code, type });
      if (res.success) {
        toast.success('Region added');
        setName('');
        setImage('');
        setCode('');
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to add region');
    }
  };

  const handleDelete = async (id, variant) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      if (variant === 'category') await adminAPI.deleteCategory(id);
      else await adminAPI.deleteRegion(id);
      toast.success('Deleted successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">App Management</h2>
          <p className="text-slate-400">Manage categories, regions, and app configurations.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-white/5">
        <button 
          onClick={() => setActiveTab('categories')}
          className={`pb-4 px-2 font-bold transition-all ${activeTab === 'categories' ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500'}`}
        >
          Categories
        </button>
        <button 
          onClick={() => setActiveTab('regions')}
          className={`pb-4 px-2 font-bold transition-all ${activeTab === 'regions' ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500'}`}
        >
          Regions & Countries
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="glass p-6 h-fit sticky top-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            {activeTab === 'categories' ? <HiOutlineTag /> : <HiOutlineGlobeAlt />}
            Add {activeTab === 'categories' ? 'Category' : 'Region'}
          </h3>
          
          <form onSubmit={activeTab === 'categories' ? handleAddCategory : handleAddRegion} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all"
                placeholder={activeTab === 'categories' ? "e.g. Adventure" : "e.g. Pakistan"}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Image URL (Cloudinary)</label>
              <input 
                type="text" 
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all"
                placeholder="https://cloudinary.com/..."
              />
              <p className="text-[10px] text-slate-500 mt-2">Coming soon: Direct upload integration</p>
            </div>

            {activeTab === 'regions' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Type</label>
                    <select 
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all"
                    >
                      <option value="country">Country</option>
                      <option value="region">Region</option>
                      <option value="city">City</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Code</label>
                    <input 
                      type="text" 
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all"
                      placeholder="PK"
                    />
                  </div>
                </div>
              </>
            )}

            <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2">
              <HiOutlinePlus /> Save {activeTab === 'categories' ? 'Category' : 'Region'}
            </button>
          </form>
        </div>

        {/* List Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [1,2,3,4].map(i => <div key={i} className="glass h-24 animate-pulse" />)
            ) : (
              (activeTab === 'categories' ? categories : regions).map((item) => (
                <div key={item._id} className="glass p-4 flex items-center gap-4 group">
                  <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden border border-white/10">
                    <img 
                      src={item.image || 'https://via.placeholder.com/150'} 
                      alt={item.name} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-lg">{item.name}</h4>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">
                      {item.type || 'Standard'}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleDelete(item._id, activeTab === 'categories' ? 'category' : 'region')}
                    className="p-3 text-slate-500 hover:text-danger hover:bg-danger/10 rounded-xl transition-all"
                  >
                    <HiOutlineTrash size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
          
          {!loading && (activeTab === 'categories' ? categories : regions).length === 0 && (
            <div className="glass p-20 text-center text-slate-500 italic">
              No items found. Use the form to add some.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Management;
