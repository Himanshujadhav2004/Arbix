import { Bot, Home, TrendingUp, Repeat } from 'lucide-react'
import { NavBar } from "@/components/ui/tubelight-navbar"

const LandingNav = () => {
  const navItems = [
    { name: 'Home', url: '/', icon: Home },
    { name: 'Agent', url: '/agent', icon: Bot },
    { name: 'Trade', url: '/login', icon: TrendingUp },
    { name: 'Swap', url: '/swap', icon: Repeat }
  ]

  return <NavBar items={navItems} />
}

export default LandingNav;
