import { Home, TrendingUp, Repeat } from 'lucide-react'
import { NavBar } from "@/components/ui/tubelight-navbar"

const LandingNav = () => {
  const navItems = [
    { name: 'Home', url: '/', icon: Home },
    { name: 'Trade', url: '/login', icon: TrendingUp },
    { name: 'Swap', url: '/swap', icon: Repeat }
  ]

  return <NavBar items={navItems} />
}

export default LandingNav;
