import { useConst } from "@hmans/use-const"
import { Bucket, IEntity, Query, WithComponents, World } from "@miniplex/core"
import React, {
  createContext,
  FunctionComponent,
  memo,
  ReactElement,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect
} from "react"
import { useArchetype as useArchetypeGlobal, useEntities } from "./hooks"
import { mergeRefs } from "./lib/mergeRefs"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export type EntityChildren<E> = ReactNode | ((entity: E) => ReactNode)

export const createReactAPI = <E extends IEntity>(world: World<E>) => {
  const EntityContext = createContext<E | null>(null)

  const useCurrentEntity = () => useContext(EntityContext)

  const useArchetype = <P extends keyof E>(...components: P[]) =>
    useArchetypeGlobal(world, ...components)

  const RawEntity = <D extends E>({
    children: givenChildren,
    entity: givenEntity = {} as D,
    as: As
  }: {
    entity?: D
    children?: EntityChildren<D>
    as?: FunctionComponent<{ entity: D; children?: ReactNode }>
  }) => {
    const entity = useConst(() => givenEntity)

    /* Add the entity to the bucket represented by this component if it isn't already part of it. */
    useIsomorphicLayoutEffect(() => {
      if (world.has(entity)) return

      world.add(entity)
      return () => {
        world.remove(entity)
      }
    }, [world, entity])

    const children =
      typeof givenChildren === "function"
        ? givenChildren(entity)
        : givenChildren

    return (
      <EntityContext.Provider value={entity}>
        {As ? <As entity={entity}>{children}</As> : children}
      </EntityContext.Provider>
    )
  }

  const Entity = memo(RawEntity) as typeof RawEntity

  const Entities = <D extends E>({
    entities,
    ...props
  }: {
    entities: D[]
    children?: EntityChildren<D>
    as?: FunctionComponent<{ entity: D; children?: ReactNode }>
  }) => (
    <>
      {entities.map((entity) => (
        <Entity key={world.id(entity)} entity={entity} {...props} />
      ))}
    </>
  )

  const RawBucket = <D extends E>({
    bucket,
    ...props
  }: {
    bucket: Bucket<D>
    children?: EntityChildren<D>
    as?: FunctionComponent<{ entity: D; children?: ReactNode }>
  }) => {
    const entities = useEntities(bucket)
    return <Entities entities={entities} {...props} />
  }

  const Bucket = memo(RawBucket) as typeof RawBucket

  const Archetype = <C extends keyof E>({
    query,
    ...props
  }: {
    query: Query<E, C> | C | C[]
    children?: EntityChildren<WithComponents<E, C>>
    as?: FunctionComponent<{
      entity: WithComponents<E, C>
      children?: ReactNode
    }>
  }) => (
    <Bucket
      bucket={
        Array.isArray(query)
          ? world.archetype(...query)
          : typeof query === "object"
          ? world.archetype(query)
          : world.archetype(query)
      }
      {...props}
    />
  )

  const Component = <P extends keyof E>(props: {
    name: P
    value?: E[P]
    children?: ReactNode
  }) => {
    const entity = useContext(EntityContext)

    if (!entity) {
      throw new Error("<Component> must be a child of <Entity>")
    }

    /* Handle creation and removal of component with a value prop */
    useIsomorphicLayoutEffect(() => {
      if (props.value === undefined) return

      world.addComponent(entity, props.name, props.value)

      return () => {
        world.removeComponent(entity, props.name)
      }
    }, [entity, props.name])

    /* Handle updates to existing component */
    useIsomorphicLayoutEffect(() => {
      if (props.value === undefined) return
      entity[props.name] = props.value
    }, [entity, props.name, props.value])

    /* Handle setting of child value */
    if (props.children) {
      const child = React.Children.only(props.children) as ReactElement

      const children = React.cloneElement(child, {
        ref: mergeRefs([
          (child as any).ref,
          (object: E[P]) => {
            if (object) {
              world.addComponent(entity, props.name, object)
            } else {
              world.removeComponent(entity, props.name)
            }
          }
        ])
      })

      return <>{children}</>
    }

    return null
  }

  return {
    Entity,
    Entities,
    Bucket,
    Archetype,
    Component,
    useCurrentEntity,
    useArchetype
  }
}