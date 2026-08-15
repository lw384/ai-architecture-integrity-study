export default function TransparentWrappers() {
    return (
        <LevelOne>
            <>
                <Fragment>
                    <React.Fragment>
                        <Portal>
                            <Transitions>
                                <LevelTwo>
                                    <LevelThree>
                                        <LevelFour>
                                            <LevelFive />
                                        </LevelFour>
                                    </LevelThree>
                                </LevelTwo>
                            </Transitions>
                        </Portal>
                    </React.Fragment>
                </Fragment>
            </>
        </LevelOne>
    );
}
