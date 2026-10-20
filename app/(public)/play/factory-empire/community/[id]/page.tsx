import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {FactoryColonyVisit} from '@/components/game/factory-colony-visit'
import {publicColonyId} from '@/lib/game/factory-3d-community'
import styles from '@/components/game/factory-community.module.css'
export const metadata:Metadata={title:'Visitar colonia — Factory Empire',robots:{index:false,follow:true}}
export default async function ColonyVisitPage({params}:{params:Promise<{id:string}>}) {const {id}=await params;if(!publicColonyId.test(id))notFound();return <div className={`mx-auto max-w-7xl px-3 py-6 sm:px-6 ${styles.surface}`}><FactoryColonyVisit id={id}/></div>}
