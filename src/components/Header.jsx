import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const { pathname } = useLocation();

  const navItems = [
    { label: 'About Me', to: '/' },
    { label: 'Projects', to: '/projects' },
    { label: 'Result Analysis', to: '/analysis' },
  ];

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="text-xl font-semibold text-blue-600 tracking-wide">ProjectAlpha</div>
        <nav className="flex gap-6 text-sm sm:text-base font-medium">
          {navItems.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={`hover:text-blue-600 transition-colors ${
                pathname === to ? 'text-blue-600 font-semibold' : 'text-gray-700'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
